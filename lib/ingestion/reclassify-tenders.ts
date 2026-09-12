/**
 * Core logic behind the admin "重新分类" button (app/admin/import-tenders/)
 * and `npm run reclassify:tenders` — re-runs the CURRENT relevance
 * classifier (lib/relevance.ts) against every already-ingested tender in
 * Supabase, and exports the result as two CSV files for download/review.
 * Straight extraction of scripts/reclassify-tenders.ts's logic (that
 * script is now a thin wrapper around this function) — see that script's
 * original header comment for the full "why this exists" story.
 *
 * Three things happen:
 *   0. Always: re-run classifyIndustries() against each row's real
 *      title/summary/buyer too (2026-09-04, per a real user report — old
 *      tenders kept showing a stale/wrong industry tag, e.g. "综合"
 *      instead of "教育"/"水务", forever, because nothing ever re-ran
 *      classifyIndustries() against already-stored rows; only relevance
 *      got recomputed here). The FRESH industries (not the stale stored
 *      ones) feed into classifyRelevance() below too, since a stale
 *      buyer-inclusive industries tag can itself skew a relevance
 *      promotion via FLAGSHIP_INDUSTRY_KEYWORDS matching against it.
 *   1. Always: fetch every tender, recompute relevance with today's rules,
 *      write exports/tenders-kept-<date>.csv and
 *      exports/tenders-excluded-<date>.csv (CSV files land on THIS
 *      machine's disk — same whether invoked via the CLI script or the
 *      admin web button, since both run on the admin's own computer),
 *      each row carrying both the previous and newly-computed tier.
 *   2. Only with write: true — for every row whose recomputed tier is
 *      "excluded", DELETE it outright; for every other row whose
 *      recomputed tier/label/reason/industries differs from what's
 *      stored, UPDATE it. A manually-overridden row
 *      (relevance_manually_overridden — see AdminTenderForm.tsx's "🔒
 *      锁定此分级" checkbox) has its relevance fields left untouched
 *      either way, but its `industries` still gets refreshed — that lock
 *      is specifically about the relevance TIER a human corrected, not
 *      about freezing the industry tags too.
 */
import { REVIEW_CSV_HEADERS, toCsv, writeReviewCsv, type CsvValue } from "@/lib/ingestion/review-csv";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyStoredTender } from "@/lib/relevance";
import type { LocalizedText, Tender, TenderRelevanceTier, TenderScopeType } from "@/types/tender";

type TenderRow = {
  slug: string;
  government_level: Tender["governmentLevel"];
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
  relevance_manually_overridden: boolean | null;
  source_url: string;
  publication_date: string;
  source_name: string;
  structured_duration_days: number | null;
};

const OUT_DIR = "exports";

export type ReclassifyTendersResult = {
  totalCount: number;
  changedCount: number;
  nowExcludedCount: number;
  nowIncludedCount: number;
  updatedCount: number;
  deletedCount: number;
  protectedSkippedCount: number;
  failedCount: number;
  /** How many rows got a different `industries` array from re-running classifyIndustries() against their real title/summary/buyer (see the header comment's new point 0). */
  industriesChangedCount: number;
  /** null when every candidate filename was locked — see writeExport(). */
  keptPath: string | null;
  excludedPath: string | null;
  write: boolean;
};

function sameIndustries(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export async function reclassifyTenders(
  supabase: SupabaseClient,
  options: {
    write: boolean;
    /**
     * Write the two review CSVs to `exports/`. Defaults to true (the CLI's
     * behaviour). The admin route passes false: a serverless filesystem is
     * read-only outside /tmp, so `mkdirSync("exports")` there threw
     * "ENOENT: no such file or directory, mkdir \'exports\'" — AFTER the
     * reclassification had already been written to Supabase, so the run
     * reported a hard failure for work it had actually completed
     * (2026-09-10, reported by the user from the 重新分类 panel).
     */
    exportCsv?: boolean;
  },
): Promise<ReclassifyTendersResult> {
  // PostgREST caps an unranged select at 1000 rows — confirmed against real
  // production data. Page with .range() so nothing past the first 1000
  // gets silently dropped.
  const PAGE_SIZE = 1000;
  const rows: TenderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "slug, tender_number, title, summary, buyer, country, government_level, industries, scope_type, estimated_value, currency, structured_duration_days, relevance_tier, relevance_label, relevance_reason, relevance_manually_overridden, source_url, publication_date, source_name",
      )
      .order("publication_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch tenders: ${error.message}`);

    const page = data as unknown as TenderRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`[reclassify-tenders] Fetched ${rows.length} tender(s) from Supabase. Recomputing relevance with the current ruleset...`);

  let changed = 0;
  let nowExcluded = 0;
  let nowIncluded = 0;
  let updated = 0;
  let deleted = 0;
  let failed = 0;
  let protectedSkipped = 0;
  let industriesChangedCount = 0;

  const keptCsvRows: CsvValue[][] = [];
  const excludedCsvRows: CsvValue[][] = [];

  for (const row of rows) {
    // classifyStoredTender() — not classifyRelevance() directly — is what
    // makes this path and the ingestion path the same path. It derives
    // industries and the tier together from the stored fields, so a re-import
    // of a row this export was signed off on lands on the same tier.
    //
    // structuredDurationDays used to be the one input this path could not
    // supply — colombia-mapper.ts computed it from SECOP's duracion /
    // unidad_de_duracion at ingestion and it had no column to live in, so a
    // Colombian row with a duration >= LONG_DURATION_DAYS was flagship at
    // import and demoted here. Migration 0029 gives it a column; rows
    // ingested before that migration read back NULL, which means exactly what
    // it meant then (unknown duration) and so changes no tier.
    const { industries: recomputedIndustries, relevance: recomputed } = classifyStoredTender({
      title: row.title.es,
      summary: row.summary.es,
      buyer: row.buyer,
      country: row.country,
      governmentLevel: row.government_level,
      scopeType: row.scope_type,
      estimatedValue: row.estimated_value ?? undefined,
      currency: row.currency ?? undefined,
      sourceName: row.source_name,
      structuredDurationDays: row.structured_duration_days ?? undefined,
    });
    const industriesChanged = !sameIndustries(row.industries, recomputedIndustries);
    if (industriesChanged) industriesChangedCount++;

    const isProtected = row.relevance_manually_overridden === true;
    const effective = isProtected ? { tier: row.relevance_tier!, label: row.relevance_label!, reason: row.relevance_reason! } : recomputed;

    const tierChanged = !isProtected && row.relevance_tier !== recomputed.tier;
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
      row.government_level,
      row.source_name,
      row.summary.es,
      recomputedIndustries.join("; "),
      row.scope_type,
      row.estimated_value ?? "",
      row.currency ?? "",
      row.relevance_tier ?? "",
      effective.tier,
      tierChanged ? "yes" : "no",
      isProtected ? "yes" : "no",
      effective.reason.zh,
      row.source_url,
      row.publication_date,
    ];

    if (effective.tier === "excluded") excludedCsvRows.push(csvRow);
    else keptCsvRows.push(csvRow);

    if (options.write) {
      if (isProtected) {
        // The lock is specifically about the relevance TIER a human
        // corrected — industries still refresh underneath it, same as an
        // unprotected row, since freezing the tier was never meant to
        // also freeze what industry the tender is tagged under.
        if (industriesChanged) {
          const { error: industriesError } = await supabase.from("tenders").update({ industries: recomputedIndustries }).eq("slug", row.slug);
          if (industriesError) {
            console.error(`[reclassify-tenders]   failed to update industries for locked ${row.slug}: ${industriesError.message}`);
            failed++;
          } else {
            updated++;
          }
        }
        protectedSkipped++;
      } else if (recomputed.tier === "excluded") {
        const { error: deleteError } = await supabase.from("tenders").delete().eq("slug", row.slug);
        if (deleteError) {
          console.error(`[reclassify-tenders]   failed to delete ${row.slug}: ${deleteError.message}`);
          failed++;
        } else {
          deleted++;
        }
      } else {
        const fieldsChanged =
          row.relevance_tier !== recomputed.tier ||
          row.relevance_label?.zh !== recomputed.label.zh ||
          row.relevance_reason?.zh !== recomputed.reason.zh ||
          industriesChanged;

        if (fieldsChanged) {
          const { error: updateError } = await supabase
            .from("tenders")
            .update({ relevance_tier: recomputed.tier, relevance_label: recomputed.label, relevance_reason: recomputed.reason, industries: recomputedIndustries })
            .eq("slug", row.slug);

          if (updateError) {
            console.error(`[reclassify-tenders]   failed to update ${row.slug}: ${updateError.message}`);
            failed++;
          } else {
            updated++;
          }
        }
      }
    }
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const writeExport = (kind: "kept" | "excluded", csv: string) =>
    writeReviewCsv({
      dir: OUT_DIR,
      baseName: `tenders-${kind}-${dateStamp}`,
      csv,
      label: "reclassify-tenders",
      failureNote: "database writes above already succeeded, only this local file export failed",
    });

  // The CSVs are a reviewer convenience; the reclassification itself is
  // already committed to Supabase by this point. Nothing about the disk can
  // be allowed to turn a completed run into a reported failure.
  let keptPath: string | null = null;
  let excludedPath: string | null = null;
  if (options.exportCsv !== false) {
    try {
      keptPath = writeExport("kept", toCsv(REVIEW_CSV_HEADERS, keptCsvRows));
      excludedPath = writeExport("excluded", toCsv(REVIEW_CSV_HEADERS, excludedCsvRows));
      if (keptPath) console.log(`[reclassify-tenders] Wrote ${keptCsvRows.length} kept tender(s) -> ${keptPath}`);
      if (excludedPath) console.log(`[reclassify-tenders] Wrote ${excludedCsvRows.length} excluded tender(s) -> ${excludedPath}`);
    } catch (err) {
      console.error(`[reclassify-tenders] CSV export skipped (${(err as Error).message}). The reclassification itself completed.`);
    }
  }

  return {
    totalCount: rows.length,
    changedCount: changed,
    nowExcludedCount: nowExcluded,
    nowIncludedCount: nowIncluded,
    updatedCount: updated,
    deletedCount: deleted,
    protectedSkippedCount: protectedSkipped,
    failedCount: failed,
    industriesChangedCount,
    keptPath,
    excludedPath,
    write: options.write,
  };
}
