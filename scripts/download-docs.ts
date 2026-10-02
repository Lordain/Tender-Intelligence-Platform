/**
 * Downloads the recorded official bid documents of tenders onto THIS
 * computer — the way to get Peruvian SEACE documents since 2026-10-02.
 *
 * WHY. 批量下载标书 runs on Vercel, and prod1.seace.gob.pe (where every
 * Peruvian document link points) now answers 403 to cloud servers, the same
 * WAF that has long refused the OECE API there (lib/ingestion/connectors/
 * peru-oece-live.ts). The user's 5-project batch came back 0 / 5 on
 * 2026-10-02. An ordinary office connection is not refused — the Peru import
 * already runs from it — so the download runs here instead.
 *
 * Works for every source with recorded links (SEACE, PEMEX, COMPR.AR /
 * CONTRAT.AR, ...). Files are named `<slug>__<document>` like the button's
 * ZIP, so 选择上传 / 本地批量分析 attach each one to its tender by name.
 * Reads the database, writes nothing to it.
 *
 * Usage:
 *   npm run download:docs -- "LP-SM-3-2026-MDM/CS-1,LP-ABR-3-2026-MINEM"
 *       tender numbers or slugs, comma-separated; the start of a number is
 *       enough when only one tender begins with it (the admin list cuts
 *       long numbers off)
 *   npm run download:docs -- --country Peru [--limit 10]
 *       the country's tenders still on 待补标书 (open, not yet analysed,
 *       with recorded links), nearest deadline first
 */
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchDocumentLinksForSlugs } from "../lib/ingestion/document-links";
import { downloadTenderDocsToFolder } from "../lib/ingestion/download-docs-to-folder";

const OUT_DIR = join("downloads", "tender-docs");

type Row = { slug: string; tender_number: string; submission_deadline: string | null };

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const country = argValue(args, "--country");
  const limit = Number(argValue(args, "--limit") ?? 10);
  const flagValues = new Set([country, argValue(args, "--limit")]);
  // Commas only: a tender number may carry spaces.
  const wanted = args
    .filter((arg) => !arg.startsWith("--") && !flagValues.has(arg))
    .flatMap((arg) => arg.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  let rows: Row[] = [];
  if (wanted.length > 0) {
    for (const value of wanted) {
      let found: Row[] = [];
      // Two plain .eq() calls rather than one .or(): a SEACE number carries
      // "/" and "." that PostgREST's filter syntax would have to have quoted.
      for (const column of ["slug", "tender_number"] as const) {
        const exact = await supabase.from("tenders").select("slug, tender_number, submission_deadline").eq(column, value);
        if (exact.error) throw new Error(exact.error.message);
        found.push(...((exact.data ?? []) as Row[]).filter((row) => !found.some((seen) => seen.slug === row.slug)));
      }
      if (found.length === 0) {
        const prefix = await supabase
          .from("tenders")
          .select("slug, tender_number, submission_deadline")
          .ilike("tender_number", `${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
          .limit(5);
        if (prefix.error) throw new Error(prefix.error.message);
        found = (prefix.data ?? []) as Row[];
        if (found.length > 1) {
          console.log(`⚠ ${value} 对应多个项目，请写完整编号：${found.map((row) => row.tender_number).join("、")}`);
          continue;
        }
      }
      if (found.length === 0) console.log(`⚠ 没找到 ${value}`);
      rows.push(...found.filter((row) => !rows.some((kept) => kept.slug === row.slug)));
    }
  } else if (country) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, submission_deadline, tender_documents(extraction_status)")
      .eq("country", country)
      .neq("relevance_tier", "excluded")
      .not("status", "in", "(awarded,cancelled)")
      .eq("documents_unavailable", false);
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    rows = ((data ?? []) as (Row & { tender_documents: { extraction_status: string }[] })[])
      .filter((row) => !row.tender_documents.some((document) => document.extraction_status === "extracted"))
      .filter((row) => !row.submission_deadline || row.submission_deadline.slice(0, 10) >= today)
      .map(({ slug, tender_number, submission_deadline }) => ({ slug, tender_number, submission_deadline }));
  } else {
    console.error('用法：npm run download:docs -- "编号1,编号2"   或   npm run download:docs -- --country Peru');
    process.exit(1);
  }

  const links = await fetchDocumentLinksForSlugs(supabase, rows.map((row) => row.slug));
  if (wanted.length === 0) {
    // By country: only what can actually be downloaded, nearest deadline first.
    rows = rows
      .filter((row) => (links.get(row.slug) ?? []).length > 0)
      .sort((a, b) => (a.submission_deadline ?? "9999").localeCompare(b.submission_deadline ?? "9999"))
      .slice(0, limit);
  }
  if (rows.length === 0) {
    console.log("没有可下载的项目。");
    process.exit(wanted.length > 0 ? 1 : 0);
  }

  const { okCount } = await downloadTenderDocsToFolder(
    rows,
    links,
    OUT_DIR,
    "这条项目没有已记录的官方标书链接，需要从「官方入口」手动下载。",
  );
  if (okCount === 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
