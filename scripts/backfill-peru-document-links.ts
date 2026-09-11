/**
 * Records official bid-document links for Peru tenders that are ALREADY in
 * Supabase.
 *
 * `ingest:peru-live` captures these links as it writes new tenders (see
 * lib/ingestion/ingest-peru.ts), but every Peru row ingested before that
 * existed has none — and the 批量下载标书 button on /admin/documents-needed
 * has nothing to download for them. This re-reads the same OCDS segments and
 * fills the links in, without touching the tenders themselves: no
 * reclassification, no upsert, no deletions.
 *
 * Safe to re-run — links upsert on (tender_id, source_url).
 *
 * Usage:
 *   npm run backfill:peru-documents                       (last 2 segments, dry run)
 *   npm run backfill:peru-documents -- --months 6 --write
 *   npm run backfill:peru-documents -- --segment 2026-08 --write
 */
import { fetchOeceRecordsForSegment, recentSegmentIds } from "../lib/ingestion/connectors/peru-oece-live";
import { mapOeceRecordToTender, oeceDocumentLinks } from "../lib/ingestion/peru-oece-mapper";
import { saveDocumentLinks, type DocumentLinksForSlug } from "../lib/ingestion/document-links";
import { PERU_OECE_SOURCE_NAME } from "../lib/ingestion/ingest-peru";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const months = Number(argValue(args, "--months") ?? 2);
  const segments = argValue(args, "--segment") ? [argValue(args, "--segment")!] : recentSegmentIds(months);
  const sourceId = argValue(args, "--source") ?? "seace_v3";

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const entries: DocumentLinksForSlug[] = [];
  let recordCount = 0;
  for (const segment of segments) {
    const records = await fetchOeceRecordsForSegment({ dataSegmentationId: segment, sourceId }, (page, soFar) => {
      if (page === 1 || page % 10 === 0) console.log(`  ${segment}: page ${page}, ${soFar} record(s)`);
    });
    recordCount += records.length;
    for (const record of records) {
      // Mapped rather than slugified inline, so the slug this writes is
      // byte-identical to the one the ingest wrote — a hand-rolled second
      // slug rule is exactly how a backfill ends up matching nothing.
      const tender = mapOeceRecordToTender(record, PERU_OECE_SOURCE_NAME);
      if (!tender) continue;
      const links = oeceDocumentLinks(record);
      if (links.length > 0) entries.push({ slug: tender.slug, links });
    }
    console.log(`${segment}: ${records.length} record(s)`);
  }

  const linkTotal = entries.reduce((sum, entry) => sum + entry.links.length, 0);
  console.log(`\n${recordCount} record(s) scanned; ${entries.length} carry document links (${linkTotal} link(s) in total).`);

  if (!write) {
    console.log("dry run (pass --write to record them) — nothing was written to Supabase.");
    return;
  }

  const saved = await saveDocumentLinks(supabase!, entries);
  console.log(
    `Recorded ${saved.linkCount} link(s) across ${saved.tendersWithLinks} stored tender(s).` +
      ` ${saved.unmatchedSlugs} record(s) had links but no stored tender (excluded or outside the import window) — expected.`,
  );
  if (saved.failed.length > 0) {
    console.error(`${saved.failed.length} batch(es) failed:`);
    for (const failure of saved.failed) console.error(`  ${failure.slug}: ${failure.error}`);
  }
}

main();
