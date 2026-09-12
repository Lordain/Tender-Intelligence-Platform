/**
 * Deletes every tender whose relevance_tier is "excluded" from the live
 * Supabase database. Per the user's explicit confirmation (2026-09-02,
 * three-question check-in on the "keep only flagship + whitelist" pass in
 * lib/relevance.ts): "剩余的可以删除" was confirmed to mean literal
 * deletion, not just hiding — "excluded" already IS "everything that
 * doesn't match the current flagship/significant rules," so this purges
 * exactly that set.
 *
 * Run `npm run reclassify:tenders -- --write` FIRST so relevance_tier is
 * actually current — this script trusts whatever is already stored, it
 * does not recompute relevance itself. Running this before a fresh
 * reclassify would delete based on stale tiers.
 *
 * Related rows (tender_requirements/tender_key_dates/tender_risks/
 * tender_documents) all have `on delete cascade` foreign keys to
 * `tenders.id` (see supabase/migrations/0001_init.sql), so deleting the
 * tender row alone is enough — no orphaned rows left behind.
 *
 * Same dry-run-by-default posture as purge-old-tenders.ts/
 * reclassify-tenders.ts: this always reports what WOULD be deleted and
 * writes a CSV to exports/ for review; only --write actually deletes
 * anything from Supabase. This can only be run from the user's own
 * machine — this sandbox cannot reach the production Supabase host.
 *
 * Usage:
 *   npm run purge:excluded-tenders             (dry run — exports a CSV, deletes nothing)
 *   npm run purge:excluded-tenders -- --write  (actually deletes from Supabase)
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

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Fast count-only query first (head:true, no row data returned — not
  // subject to PostgREST's default 1000-row select cap, which only bites
  // when actual row data comes back).
  const { count, error: countError } = await supabase
    .from("tenders")
    .select("*", { count: "exact", head: true })
    .eq("relevance_tier", "excluded");

  if (countError) {
    console.error(`Failed to count excluded tenders: ${countError.message}`);
    process.exit(1);
  }

  console.log(`${count ?? 0} tender(s) currently have relevance_tier = "excluded".`);

  // Paginate through the matching rows to build a preview/export CSV —
  // same .range() pattern as the other purge/reclassify scripts, so
  // nothing past the first 1000 gets silently dropped from the export.
  const PAGE_SIZE = 1000;
  type PreviewRow = {
    slug: string;
    tender_number: string;
    title: { zh: string };
    buyer: string;
    country: string;
    relevance_reason: { zh: string } | null;
    publication_date: string;
    source_url: string;
  };
  const rows: PreviewRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, buyer, country, relevance_reason, publication_date, source_url")
      .eq("relevance_tier", "excluded")
      .order("publication_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Failed to fetch excluded tenders: ${error.message}`);
      process.exit(1);
    }
    const page = data as unknown as PreviewRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const csvPath = join(OUT_DIR, `tenders-excluded-purged-${dateStamp}.csv`);
  writeFileSync(
    csvPath,
    toCsv(
      ["slug", "tender_number", "title_zh", "buyer", "country", "relevance_reason_zh", "publication_date", "source_url"],
      rows.map((r) => [
        r.slug,
        r.tender_number,
        r.title.zh,
        r.buyer,
        r.country,
        r.relevance_reason?.zh ?? "",
        r.publication_date,
        r.source_url,
      ]),
    ),
  );
  console.log(`Wrote ${rows.length} row(s) that ${shouldWrite ? "will be" : "would be"} deleted -> ${csvPath}`);

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to actually delete these from Supabase) — nothing was deleted.");
    console.log("Tip: run `npm run reclassify:tenders -- --write` first if you haven't since the latest relevance.ts changes, so relevance_tier reflects the current rules before you purge by it.");
    return;
  }

  const { error: deleteError, count: deletedCount } = await supabase
    .from("tenders")
    .delete({ count: "exact" })
    .eq("relevance_tier", "excluded");

  if (deleteError) {
    console.error(`Delete failed: ${deleteError.message}`);
    process.exit(1);
  }

  console.log(`\nDeleted ${deletedCount ?? "unknown number of"} tender(s) from Supabase.`);
}

main();
