/**
 * Records the bid-document links of Argentine tenders already stored from
 * COMPR.AR and CONTRAT.AR, which were imported before the import started
 * recording them (2026-09-29, user: 做成自动下载). New imports record them
 * themselves (ingest-argentina.ts).
 *
 * Opens each tender's process page — and its circulars' pages — reads the
 * download buttons, and saves one tender_document_links row per document.
 * Nothing else about the tender is touched. Re-running is harmless: links
 * are upserted on (tender_id, source_url).
 *
 * Usage:
 *   npm run backfill:argentina-docs            (dry run — lists what it would save)
 *   npm run backfill:argentina-docs -- --write
 *
 * The portals time out from mainland China; run it from GitHub Actions —
 * "Backfill Argentina bid documents" (.github/workflows/backfill-argentina-docs.yml).
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import {
  PortalSession,
  parseCircularDocuments,
  parsePortalCirculars,
  parsePortalProcess,
  type ArgentinaPortalRecord,
} from "../lib/ingestion/connectors/argentina-portal-live";
import { portalDocumentLinks } from "../lib/ingestion/argentina-mapper";
import { saveDocumentLinks, type DocumentLinksForSlug } from "../lib/ingestion/document-links";
import { hasWriteFlag } from "@/lib/cli-write-flag";

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("tenders")
    .select("slug, tender_number, source_url")
    .eq("country", "Argentina")
    .or("source_url.like.https://comprar.gob.ar/*,source_url.like.https://contratar.gob.ar/*,source_url.like.https://comprar.mendoza.gov.ar/*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { slug: string; tender_number: string; source_url: string }[];
  console.log(`COMPR.AR / CONTRAT.AR 项目 ${rows.length} 条\n`);

  const entries: DocumentLinksForSlug[] = [];
  let unreadable = 0;
  for (const row of rows) {
    // Two tries: COMPR.AR answers an occasional 503 that clears on the next
    // request (38/1-0455-LPU26 in the 2026-09-29 dry run).
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const links = await readDocumentLinks(row.source_url, row.tender_number);
        entries.push({ slug: row.slug, links });
        console.log(`${row.tender_number}：${links.length} 个文件`);
        for (const link of links) console.log(`    ${link.documentType} | ${link.fileName}`);
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === 1) {
          console.log(`${row.tender_number}：第一次失败（${message}），10 秒后重试`);
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        } else {
          unreadable += 1;
          console.log(`${row.tender_number}：❌ ${message}`);
        }
      }
    }
  }
  if (unreadable > 0) console.log(`\n${unreadable} 个项目两次都读不出，没有写入；再跑一次即可补上。`);

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }
  const saved = await saveDocumentLinks(supabase, entries);
  console.log(`\n写入：${saved.tendersWithLinks} 个项目，${saved.linkCount} 个文件链接${saved.failed.length > 0 ? `，${saved.failed.length} 个失败` : ""}。`);
  for (const failure of saved.failed) console.log(`  ${failure.slug} —— ${failure.error}`);
  if (saved.failed.length > 0) process.exit(1);
}

/** Opens the process page and its circulars, and returns one link per download button. */
async function readDocumentLinks(sourceUrl: string, tenderNumber: string) {
  const session = new PortalSession();
  const detail = await session.page(sourceUrl);
  const process = parsePortalProcess(detail.html);
  if (!process) throw new Error("项目页读不出编号和名称");
  for (const circular of parsePortalCirculars(detail.html, detail.url)) {
    try {
      process.documents.push(...parseCircularDocuments((await session.page(circular.url)).html, circular));
    } catch (err) {
      console.log(`  ⚠ ${tenderNumber} 澄清 ${circular.number} 打不开：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const record = { portal: sourceUrl.includes("contratar") ? "contratar" : sourceUrl.includes("mendoza") ? "mendoza" : "comprar", url: sourceUrl, process } as ArgentinaPortalRecord;
  return portalDocumentLinks(record);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
