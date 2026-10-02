/**
 * Downloads the recorded COMPR.AR / CONTRAT.AR bid documents of Argentine
 * tenders into one folder, for the "Download Argentina bid documents"
 * workflow (.github/workflows/download-argentina-docs.yml) to hand back as a
 * ZIP (user, 2026-10-02: 阿根廷附件一直失败，无法下载).
 *
 * WHY NOT 批量下载标书. That button runs on Vercel inside 300 s, and these
 * portals are slow: the process page takes 9–23 s to serve and a 27 MB
 * technical volume took 94 s on its own (measured 2026-10-02). A project like
 * 34-0003-LPU26 carries nine such volumes — it cannot fit, however the work is
 * scheduled. The GitHub runner reaches both portals every night and has hours.
 *
 * Files are named `<slug>__<document>` like the button's ZIP, so
 * /admin/local-batch and 选择上传 attach each one to its tender by name.
 * Nothing is written to the database.
 *
 * Usage:
 *   npm run download:argentina-docs -- 34-0003-LPU26,46-0035-LPU26
 *   npm run download:argentina-docs                  (every Argentine portal tender with links, still open)
 */
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchDocumentLinksForSlugs } from "../lib/ingestion/document-links";
import { parsePortalDocumentUrl } from "../lib/ingestion/connectors/argentina-portal-live";
import { downloadTenderDocsToFolder } from "../lib/ingestion/download-docs-to-folder";

const OUT_DIR = join("downloads", "argentina-docs");

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const wanted = (process.argv[2] ?? "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith("--"));

  const { data, error } = await supabase
    .from("tenders")
    .select("slug, tender_number, submission_deadline")
    .eq("country", "Argentina")
    .or("source_url.like.https://comprar.gob.ar/*,source_url.like.https://contratar.gob.ar/*");
  if (error) throw new Error(error.message);
  const today = new Date().toISOString().slice(0, 10);
  const rows = ((data ?? []) as { slug: string; tender_number: string; submission_deadline: string | null }[]).filter((row) =>
    // Asked for by number or slug: exactly those. Otherwise every tender still open.
    wanted.length > 0
      ? wanted.includes(row.tender_number) || wanted.includes(row.slug)
      : !row.submission_deadline || row.submission_deadline.slice(0, 10) >= today,
  );
  if (rows.length === 0) {
    console.log(wanted.length > 0 ? `没有找到这些编号的 COMPR.AR / CONTRAT.AR 项目：${wanted.join("、")}` : "没有仍在投标期的 COMPR.AR / CONTRAT.AR 项目。");
    process.exit(wanted.length > 0 ? 1 : 0);
  }
  if (wanted.length > 0) {
    const found = new Set(rows.flatMap((row) => [row.slug, row.tender_number]));
    for (const w of wanted.filter((w) => !found.has(w))) console.log(`⚠ 没找到 ${w}`);
  }

  const allLinks = await fetchDocumentLinksForSlugs(supabase, rows.map((row) => row.slug));
  const links = new Map(
    [...allLinks].map(([slug, list]) => [slug, list.filter((link) => parsePortalDocumentUrl(link.sourceUrl))]),
  );
  const { okCount } = await downloadTenderDocsToFolder(
    rows,
    links,
    OUT_DIR,
    "还没有记录标书链接——先运行「Backfill Argentina bid documents」。",
  );
  if (okCount === 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
