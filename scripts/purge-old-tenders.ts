/**
 * Deletes tenders whose publication_date is older than a cutoff (default
 * 6 months) from the live Supabase database. Per the user's explicit
 * request (2026-09-02): "把6个月以前的数据都先删除，不要老旧的数据" — old
 * tenders are long past their submission deadline and just add noise to
 * the "reduce kept count" tightening pass done alongside this script (see
 * lib/relevance.ts).
 *
 * Related rows (tender_requirements/tender_key_dates/tender_risks/
 * tender_documents) all have `on delete cascade` foreign keys to
 * `tenders.id` (see supabase/migrations/0001_init.sql), so deleting the
 * tender row alone is enough — no orphaned rows left behind.
 *
 * Same dry-run-by-default posture as reclassify-tenders.ts: this always
 * reports what WOULD be deleted and writes a CSV to exports/ for review;
 * only --write actually deletes anything from Supabase. This can only be
 * run from the user's own machine — this sandbox cannot reach the
 * production Supabase host (see lib/ingestion/README.md).
 *
 * Usage:
 *   npm run purge:old-tenders                       (dry run — 6 months, exports a CSV, deletes nothing)
 *   npm run purge:old-tenders -- --months=9          (dry run — custom cutoff)
 *   npm run purge:old-tenders -- --write             (actually deletes from Supabase)
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const OUT_DIR = "exports";

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvField).join(","))].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const monthsArg = args.find((a) => a.startsWith("--months="));
  const months = monthsArg ? Number(monthsArg.split("=")[1]) : 6;

  if (!Number.isFinite(months) || months <= 0) {
    console.error(`Invalid --months value: ${monthsArg}`);
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffIso = cutoff.toISOString();

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  console.log(`Cutoff: tenders with publication_date < ${cutoffIso} (${months} month(s) old).`);

  // Fast count-only query first (head:true, no row data returned — not
  // subject to PostgREST's default 1000-row select cap, which only bites
  // when actual row data comes back — see lib/db/tenders.ts's comment on
  // the real bug that cap caused).
  const { count, error: countError } = await supabase
    .from("tenders")
    .select("*", { count: "exact", head: true })
    .lt("publication_date", cutoffIso);

  if (countError) {
    console.error(`Failed to count old tenders: ${countError.message}`);
    process.exit(1);
  }

  console.log(`${count ?? 0} tender(s) match the cutoff.`);

  // Paginate through the matching rows to build a preview/export CSV —
  // same .range() pattern as reclassify-tenders.ts, so nothing past the
  // first 1000 gets silently dropped from the export.
  const PAGE_SIZE = 1000;
  type PreviewRow = { slug: string; tender_number: string; title: { zh: string }; country: string; publication_date: string; source_url: string };
  const rows: PreviewRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, country, publication_date, source_url")
      .lt("publication_date", cutoffIso)
      .order("publication_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Failed to fetch old tenders: ${error.message}`);
      process.exit(1);
    }
    const page = data as unknown as PreviewRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const csvPath = join(OUT_DIR, `tenders-purged-${dateStamp}.csv`);
  writeFileSync(
    csvPath,
    toCsv(
      ["slug", "tender_number", "title_zh", "country", "publication_date", "source_url"],
      rows.map((r) => [r.slug, r.tender_number, r.title.zh, r.country, r.publication_date, r.source_url]),
    ),
  );
  console.log(`Wrote ${rows.length} row(s) that ${shouldWrite ? "will be" : "would be"} deleted -> ${csvPath}`);

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to actually delete these from Supabase) — nothing was deleted.");
    return;
  }

  const { error: deleteError, count: deletedCount } = await supabase
    .from("tenders")
    .delete({ count: "exact" })
    .lt("publication_date", cutoffIso);

  if (deleteError) {
    console.error(`Delete failed: ${deleteError.message}`);
    process.exit(1);
  }

  console.log(`\nDeleted ${deletedCount ?? "unknown number of"} tender(s) from Supabase.`);
}

main();
