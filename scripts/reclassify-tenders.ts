/**
 * Re-runs the CURRENT relevance classifier (lib/relevance.ts) against every
 * already-ingested tender in Supabase, and exports the result as two CSV
 * files for download/review.
 *
 * Why this is needed: fetchAllTendersFromDb() (lib/db/tenders.ts) only
 * recomputes relevance on the fly for legacy rows that have no stored
 * relevance_tier at all — every row that already has one (i.e. almost
 * everything ingested so far) keeps showing whatever tier it got at ingest
 * time. The blacklist/whitelist rules in lib/relevance.ts have changed
 * substantially since most of this platform's real data was ingested
 * (MIN_VALUE_USD raised from $10k to $50k, two real-observed exclude-
 * keyword batches added, the allowlist gate added) — so the live site is
 * currently showing stale classifications for most already-ingested
 * tenders. This script is how those get brought current.
 *
 * Two things happen:
 *   1. Always: fetch every tender, recompute relevance with today's rules,
 *      write exports/tenders-kept-<date>.csv (everything that would show
 *      in the default feed — tier != "excluded") and
 *      exports/tenders-excluded-<date>.csv (everything hidden), each row
 *      carrying both the previous and newly-computed tier so a changed
 *      classification is visible at a glance. This is the "cleaned list"
 *      to download and review for the next round of keyword tuning.
 *   2. Only with --write: also UPDATE relevance_tier/relevance_label/
 *      relevance_reason in Supabase for every row whose recomputed tier,
 *      label, or reason actually differs from what's stored — this is
 *      what actually "cleans" the live site (excluded tenders drop out of
 *      the public feed the moment this runs; see the comment in
 *      TenderExplorer.tsx confirming "excluded" is always hidden by
 *      default).
 *
 * No rows are ever deleted — relevance_tier is metadata, not the tenders
 * themselves; classification can always be re-run again as the keyword
 * lists keep evolving.
 *
 * Usage:
 *   npm run reclassify:tenders                (dry run — exports CSVs, reports what would change, writes nothing to Supabase)
 *   npm run reclassify:tenders -- --write      (also updates Supabase)
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { classifyRelevance } from "../lib/relevance";
import type { LocalizedText, TenderRelevanceTier, TenderScopeType } from "../types/tender";

type TenderRow = {
  slug: string;
  tender_number: string;
  title: LocalizedText;
  summary: LocalizedText;
  buyer: string;
  country: string;
  industries: string[];
  scope_type: TenderScopeType;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_label: LocalizedText | null;
  relevance_reason: LocalizedText | null;
  source_url: string;
  publication_date: string;
};

const OUT_DIR = "exports";

function csvField(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
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

  // PostgREST caps an unranged select at 1000 rows — confirmed against
  // real production data (a first run silently returned exactly 1000 with
  // no error). Page with .range() so nothing past the first 1000 gets
  // silently dropped from either the CSV export or the --write pass.
  const PAGE_SIZE = 1000;
  const rows: TenderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "slug, tender_number, title, summary, buyer, country, industries, scope_type, estimated_value, currency, relevance_tier, relevance_label, relevance_reason, source_url, publication_date",
      )
      .order("publication_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Failed to fetch tenders: ${error.message}`);
      process.exit(1);
    }

    const page = data as unknown as TenderRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`Fetched ${rows.length} tender(s) from Supabase. Recomputing relevance with the current ruleset...`);

  let changed = 0;
  let nowExcluded = 0;
  let nowIncluded = 0;
  let updated = 0;
  let failed = 0;

  const keptCsvRows: (string | number | boolean | null | undefined)[][] = [];
  const excludedCsvRows: (string | number | boolean | null | undefined)[][] = [];

  for (const row of rows) {
    const recomputed = classifyRelevance({
      title: row.title.es,
      summary: row.summary.es,
      industries: row.industries,
      scopeType: row.scope_type,
      estimatedValue: row.estimated_value ?? undefined,
      currency: row.currency ?? undefined,
    });

    const tierChanged = row.relevance_tier !== recomputed.tier;
    if (tierChanged) {
      changed++;
      if (recomputed.tier === "excluded" && row.relevance_tier !== "excluded") nowExcluded++;
      if (recomputed.tier !== "excluded" && row.relevance_tier === "excluded") nowIncluded++;
    }

    const csvRow = [
      row.slug,
      row.tender_number,
      row.title.zh,
      row.title.es,
      row.buyer,
      row.country,
      row.industries.join("; "),
      row.scope_type,
      row.estimated_value ?? "",
      row.currency ?? "",
      row.relevance_tier ?? "",
      recomputed.tier,
      tierChanged ? "yes" : "no",
      recomputed.reason.zh,
      row.source_url,
      row.publication_date,
    ];

    if (recomputed.tier === "excluded") excludedCsvRows.push(csvRow);
    else keptCsvRows.push(csvRow);

    if (shouldWrite) {
      const fieldsChanged =
        row.relevance_tier !== recomputed.tier ||
        row.relevance_label?.zh !== recomputed.label.zh ||
        row.relevance_reason?.zh !== recomputed.reason.zh;

      if (fieldsChanged) {
        const { error: updateError } = await supabase
          .from("tenders")
          .update({
            relevance_tier: recomputed.tier,
            relevance_label: recomputed.label,
            relevance_reason: recomputed.reason,
          })
          .eq("slug", row.slug);

        if (updateError) {
          console.error(`  failed to update ${row.slug}: ${updateError.message}`);
          failed++;
        } else {
          updated++;
        }
      }
    }
  }

  const headers = [
    "slug",
    "tender_number",
    "title_zh",
    "title_es",
    "buyer",
    "country",
    "industries",
    "scope_type",
    "estimated_value",
    "currency",
    "previous_tier",
    "new_tier",
    "tier_changed",
    "reason_zh",
    "source_url",
    "publication_date",
  ];

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const keptPath = join(OUT_DIR, `tenders-kept-${dateStamp}.csv`);
  const excludedPath = join(OUT_DIR, `tenders-excluded-${dateStamp}.csv`);

  writeFileSync(keptPath, toCsv(headers, keptCsvRows));
  writeFileSync(excludedPath, toCsv(headers, excludedCsvRows));

  console.log(`\nWrote ${keptCsvRows.length} kept tender(s) -> ${keptPath}`);
  console.log(`Wrote ${excludedCsvRows.length} excluded tender(s) -> ${excludedPath}`);
  console.log(
    `\n${changed} of ${rows.length} tender(s) would change tier under the current rules (${nowExcluded} newly excluded, ${nowIncluded} newly rescued into the feed).`,
  );

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to also update relevance_tier/label/reason in Supabase) — nothing was written to Supabase.");
  } else {
    console.log(`\nUpdated ${updated} row(s) in Supabase (${failed} failed).`);
  }
}

main();
