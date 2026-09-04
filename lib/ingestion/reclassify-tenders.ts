/**
 * Core logic behind the admin "重新分类" button (app/admin/import-tenders/)
 * and `npm run reclassify:tenders` — re-runs the CURRENT relevance
 * classifier (lib/relevance.ts) against every already-ingested tender in
 * Supabase, and exports the result as two CSV files for download/review.
 * Straight extraction of scripts/reclassify-tenders.ts's logic (that
 * script is now a thin wrapper around this function) — see that script's
 * original header comment for the full "why this exists" story.
 *
 * Two things happen:
 *   1. Always: fetch every tender, recompute relevance with today's rules,
 *      write exports/tenders-kept-<date>.csv and
 *      exports/tenders-excluded-<date>.csv (CSV files land on THIS
 *      machine's disk — same whether invoked via the CLI script or the
 *      admin web button, since both run on the admin's own computer),
 *      each row carrying both the previous and newly-computed tier.
 *   2. Only with write: true — for every row whose recomputed tier is
 *      "excluded", DELETE it outright; for every other row whose
 *      recomputed tier/label/reason differs from what's stored, UPDATE it.
 *      A manually-overridden row (relevance_manually_overridden — see
 *      AdminTenderForm.tsx's "🔒 锁定此分级" checkbox) is left untouched
 *      either way.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyRelevance } from "@/lib/relevance";
import type { LocalizedText, TenderRelevanceTier, TenderScopeType } from "@/types/tender";

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
  relevance_manually_overridden: boolean | null;
  source_url: string;
  publication_date: string;
  source_name: string;
};

// isNationalPriorityProject isn't a persisted column — see
// proyectos-estrategicos-mapper.ts — so it's re-derived here from the one
// real, already-persisted field that identifies the source: source_name.
const NATIONAL_PRIORITY_SOURCE_NAME = "Proyectos Estratégicos MX (Hacienda)";

const OUT_DIR = "exports";

function csvField(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvField).join(","))].join("\n");
}

export type ReclassifyTendersResult = {
  totalCount: number;
  changedCount: number;
  nowExcludedCount: number;
  nowIncludedCount: number;
  updatedCount: number;
  deletedCount: number;
  protectedSkippedCount: number;
  failedCount: number;
  keptPath: string;
  excludedPath: string;
  write: boolean;
};

export async function reclassifyTenders(supabase: SupabaseClient, options: { write: boolean }): Promise<ReclassifyTendersResult> {
  // PostgREST caps an unranged select at 1000 rows — confirmed against real
  // production data. Page with .range() so nothing past the first 1000
  // gets silently dropped.
  const PAGE_SIZE = 1000;
  const rows: TenderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "slug, tender_number, title, summary, buyer, country, industries, scope_type, estimated_value, currency, relevance_tier, relevance_label, relevance_reason, relevance_manually_overridden, source_url, publication_date, source_name",
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
      buyer: row.buyer,
      isNationalPriorityProject: row.source_name === NATIONAL_PRIORITY_SOURCE_NAME,
    });

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
      row.industries.join("; "),
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
          row.relevance_reason?.zh !== recomputed.reason.zh;

        if (fieldsChanged) {
          const { error: updateError } = await supabase
            .from("tenders")
            .update({ relevance_tier: recomputed.tier, relevance_label: recomputed.label, relevance_reason: recomputed.reason })
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
    "manually_protected",
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
  console.log(`[reclassify-tenders] Wrote ${keptCsvRows.length} kept tender(s) -> ${keptPath}`);
  console.log(`[reclassify-tenders] Wrote ${excludedCsvRows.length} excluded tender(s) -> ${excludedPath}`);

  return {
    totalCount: rows.length,
    changedCount: changed,
    nowExcludedCount: nowExcluded,
    nowIncludedCount: nowIncluded,
    updatedCount: updated,
    deletedCount: deleted,
    protectedSkippedCount: protectedSkipped,
    failedCount: failed,
    keptPath,
    excludedPath,
    write: options.write,
  };
}
