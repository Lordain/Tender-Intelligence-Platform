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
 * WHICH TENDERS (2026-10-09, user: 项目数明显多过我实际选择后的项目数). Named
 * ones when numbers are given. With none, the tenders the 待补文件 page lists
 * (fetchTendersNeedingDocumentsFromDb): open, not excluded, not awarded or
 * cancelled, not marked unavailable or already downloaded, and no document
 * analysed yet. It used to be every open tender, so a run on 2026-10-07
 * fetched seven projects for the two that still needed files.
 *
 * LARGE FILES (2026-10-09, user: 我会下载失败，因为有超大标书). That same run
 * made a 1.2 GB ZIP, 1.08 GB of it one project (34-0003-LPU26, volumes of
 * 113–281 MB). A project with any file over LARGE_FILE_MB (default 50, the
 * 选择上传 limit) moves whole to downloads/argentina-docs-large, a separate
 * artifact; each oversized PDF also leaves its first 40 pages — the most any
 * tier's analysis reads (maxPagesForTier) — in the main folder, named so
 * 选择上传 still matches it.
 *
 * Files are named `<slug>__<document>` like the button's ZIP, so
 * /admin/local-batch and 选择上传 attach each one to its tender by name.
 * Nothing is written to the database.
 *
 * Usage:
 *   npm run download:argentina-docs -- 34-0003-LPU26,46-0035-LPU26
 *   npm run download:argentina-docs                  (the Argentine portal tenders still needing documents)
 */
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchDocumentLinksForSlugs } from "../lib/ingestion/document-links";
import { parsePortalDocumentUrl } from "../lib/ingestion/connectors/argentina-portal-live";
import { downloadTenderDocsToFolder } from "../lib/ingestion/download-docs-to-folder";
import { setAsideLargeProjects } from "../lib/ingestion/set-aside-large-projects";

const OUT_DIR = join("downloads", "argentina-docs");
const LARGE_DIR = join("downloads", "argentina-docs-large");

type Row = {
  slug: string;
  tender_number: string;
  submission_deadline: string | null;
  relevance_tier: string | null;
  status: string | null;
  documents_unavailable: boolean | null;
  documents_downloaded_at: string | null;
  tender_documents: { extraction_status: string | null }[] | null;
};

/** The 待补文件 rule (fetchTendersNeedingDocumentsFromDb), plus still open. */
function stillNeedsDocuments(row: Row, today: string): boolean {
  if (row.submission_deadline && row.submission_deadline.slice(0, 10) < today) return false;
  if (row.relevance_tier === "excluded") return false;
  if (row.status === "awarded" || row.status === "cancelled") return false;
  if (row.documents_unavailable) return false;
  // 标记下载 means the admin already has the files.
  if (row.documents_downloaded_at) return false;
  return !(row.tender_documents ?? []).some((document) => document.extraction_status === "extracted");
}

function largeFileBytes(): number {
  const mb = Number(process.env.LARGE_FILE_MB ?? "50");
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

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
    .select("slug, tender_number, submission_deadline, relevance_tier, status, documents_unavailable, documents_downloaded_at, tender_documents ( extraction_status )")
    .eq("country", "Argentina")
    .or("source_url.like.https://comprar.gob.ar/*,source_url.like.https://contratar.gob.ar/*,source_url.like.https://comprar.mendoza.gov.ar/*");
  if (error) throw new Error(error.message);
  const today = new Date().toISOString().slice(0, 10);
  const rows = ((data ?? []) as Row[]).filter((row) =>
    // Asked for by number or slug: exactly those. Otherwise the 待补文件 list.
    wanted.length > 0 ? wanted.includes(row.tender_number) || wanted.includes(row.slug) : stillNeedsDocuments(row, today),
  );
  if (rows.length === 0) {
    console.log(wanted.length > 0 ? `没有找到这些编号的 COMPR.AR / CONTRAT.AR 项目：${wanted.join("、")}` : "没有待补文件的 COMPR.AR / CONTRAT.AR 项目。");
    process.exit(wanted.length > 0 ? 1 : 0);
  }
  if (wanted.length > 0) {
    const found = new Set(rows.flatMap((row) => [row.slug, row.tender_number]));
    for (const w of wanted.filter((w) => !found.has(w))) console.log(`⚠ 没找到 ${w}`);
  } else {
    console.log(`待补文件的项目 ${rows.length} 个：${rows.map((row) => row.tender_number).join("、")}`);
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
  for (const line of setAsideLargeProjects(OUT_DIR, LARGE_DIR, largeFileBytes())) console.log(line);
  if (okCount === 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
