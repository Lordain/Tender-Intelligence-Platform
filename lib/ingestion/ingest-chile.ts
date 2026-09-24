/**
 * Shared Chile ingestion — the one path any caller goes through.
 *
 * Right now that is only `npm run ingest:chile-live`. The admin 新项目清单
 * button is deliberately NOT added this pass (see README), and this file is
 * still the shared path rather than living inside the CLI, because the split
 * is what stops the two from drifting the day the button does get added —
 * exactly the reason ingest-peru.ts and ingest-colombia.ts exist.
 *
 * ── The thing this importer has to be honest about ────────────────────────
 *
 * Chile's OCDS export has published nothing since 2026-07-29 (measured
 * 2026-09-24; see chile-ocds-live.ts for how that was established). So a run
 * asking for "the last two months" today fetches two empty months and keeps
 * zero rows — and would report that as a clean, successful import.
 *
 * `freshnessWarning` exists so it cannot. An importer that reads a stalled
 * feed as an empty one announces success forever, which is the README's
 * 够不着 ≠ 空 ≠ 还没发布 ≠ 根本没问 rule one step further along: the source
 * stopped and nobody noticed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeIndexFreshness,
  fetchChileOcdsMonth,
} from "@/lib/ingestion/connectors/chile-ocds-live";
import { CHILE_SOURCE_NAME, mapChileOcdsPackageToTender } from "@/lib/ingestion/chile-ocds-mapper";
import { filterRecentTenders, filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

export { CHILE_SOURCE_NAME };

export type ChileIngestResult = {
  months: string[];
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  /** Rows that would actually surface in the feed — everything not "excluded". */
  surfacedCount: number;
  tierCounts: Record<TenderRelevanceTier, number>;
  /** Per-record fetch failures, which do NOT fail the month — see fetchChileOcdsMonth. */
  failedRecords: { code: string; error: string }[];
  /**
   * Non-null when every requested month came back empty. Printed loudly rather
   * than returned as a zero — see this file's header.
   */
  freshnessWarning: string | null;
  write: boolean;
  preview?: Tender[];
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};

export type ChileIngestOptions = {
  write: boolean;
  /** Calendar months back from `now` to fetch, newest first. Ignored when `month` is set. */
  months?: number;
  /** One specific `YYYY-MM`. */
  month?: string;
  /** Rolling window in days applied to what is KEPT. The fetch is still whole months — the index has no finer grain. */
  days?: number;
  /** Stop after this many records per month. For a cheap look at a ~9,000-record month. */
  maxRecords?: number;
  /** Return every kept row, not just the top five — the CLI's classification report needs all of them. */
  preview?: boolean;
};

/** `YYYY-MM` labels, newest first, built off UTC parts so the list cannot shift under a machine's local zone. */
export function recentChileMonths(months: number, now: Date = new Date()): string[] {
  const count = months > 0 ? months : 1;
  const labels: string[] = [];
  for (let back = 0; back < count; back++) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    labels.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return labels;
}

/**
 * Which rows survive the fetch — and, more importantly, when NOT to filter.
 *
 * `--month 2026-07` asking for 60 records and keeping 0 is what this function
 * exists to prevent, and it is not hypothetical: it is what the first real
 * dry run of this importer did. `--month` names a window explicitly, and the
 * default two-month recency filter then silently applied a SECOND, narrower
 * window on top of it — every one of those 60 real records was published
 * before the 2026-07-24 cutoff, so all 60 were dropped and the run reported
 * "Mapped 60, keeping 0" as though the month were uninteresting.
 *
 * The bite is worse for Chile specifically than it would be anywhere else,
 * because the newest month this source has is already ~2 months old: asking
 * for it BY NAME is the only way to see any Chilean data at all right now,
 * and that is exactly the call the filter was eating.
 *
 * So: an explicitly named month is the window. `--days` still narrows it for
 * a caller who wants that, because they asked for it in the same breath.
 */
function applyRecency(mapped: Tender[], options: ChileIngestOptions): Tender[] {
  if (options.days && options.days > 0) return filterTendersPublishedWithinDays(mapped, options.days);
  if (options.month) return mapped;
  return filterRecentTenders(mapped, options.months ?? 2);
}

function parseMonthLabel(label: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(label);
  if (!match) throw new Error(`月份要写成 YYYY-MM，收到的是「${label}」`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export async function ingestChile(
  supabase: SupabaseClient | null,
  options: ChileIngestOptions,
  onProgress?: (message: string) => void,
): Promise<ChileIngestResult> {
  const months = options.month ? [options.month] : recentChileMonths(options.months ?? 2);

  const packages = [];
  const failedRecords: { code: string; error: string }[] = [];
  const monthSummaries: { label: string; empty: boolean; total: number }[] = [];
  for (const label of months) {
    const { year, month } = parseMonthLabel(label);
    const fetched = await fetchChileOcdsMonth(year, month, { maxRecords: options.maxRecords }, onProgress);
    monthSummaries.push({ label, empty: fetched.empty, total: fetched.total });
    packages.push(...fetched.packages);
    failedRecords.push(...fetched.failed);
    onProgress?.(`${label}：取到 ${fetched.packages.length} 条（索引说共 ${fetched.total} 条），失败 ${fetched.failed.length} 条`);
  }

  const mapped: Tender[] = [];
  for (const pkg of packages) {
    const tender = mapChileOcdsPackageToTender(pkg);
    if (tender) mapped.push(tender);
  }

  const kept = applyRecency(mapped, options);

  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of kept) tierCounts[tender.relevance.tier] += 1;

  const result: ChileIngestResult = {
    months,
    fetchedCount: packages.length,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    surfacedCount: kept.length - tierCounts.excluded,
    tierCounts,
    failedRecords,
    freshnessWarning: describeIndexFreshness(monthSummaries),
    write: options.write,
    ...(options.preview ? { preview: kept } : {}),
    sample: kept
      .filter((tender) => tender.relevance.tier !== "excluded")
      .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
      .slice(0, 5),
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
