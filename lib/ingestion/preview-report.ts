/**
 * The dry-run report an ingest script prints before anything is written.
 *
 * Built for Peru's first real import (2026-09-11), where one `--months 2`
 * run mapped 8620 records and the script's then-behaviour — dumping the first
 * five Tender objects as JSON — said nothing at all about whether the rules
 * were right on the other 8615. Lives in lib/ rather than in the script so it
 * can be exercised against the offline fixtures, and so the other ingest
 * scripts can adopt it without a copy.
 *
 * Country-agnostic on purpose: it only reads fields every mapper already
 * fills in.
 */
import { convertToUsd } from "@/lib/currency";
import { REVIEW_CSV_HEADERS, reviewCsvRow, toCsv, writeReviewCsv } from "@/lib/ingestion/review-csv";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

const TIER_ORDER: TenderRelevanceTier[] = ["flagship", "significant", "standard", "excluded"];

function usdOf(tender: Tender): number | null {
  if (tender.estimatedValue === undefined) return null;
  return convertToUsd(tender.estimatedValue, tender.currency) ?? null;
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;
}


/**
 * What a dry run actually has to answer: how many of these would reach the
 * feed, and — when that number is small — whether it is small because Peru's
 * municipal procurement genuinely is, or because something upstream is
 * missing. Value coverage is broken out for exactly that reason: OECE
 * publishes `tender.value.amount` as 0.0 on a large share of records, and a
 * row with no value cannot clear MIN_VALUE_USD no matter what it is for, so
 * "excluded" and "excluded for lack of any amount to judge" are different
 * findings that need different fixes.
 */
export function reportClassificationPreview(
  tenders: Tender[],
  options: { examples?: number; label: string; exportBaseName: string; outDir?: string },
): void {
  const { label, exportBaseName } = options;
  const examples = options.examples && options.examples > 0 ? options.examples : 25;
  const total = tenders.length;
  const byTier = new Map<TenderRelevanceTier, Tender[]>();
  for (const tender of tenders) {
    const bucket = byTier.get(tender.relevance.tier) ?? [];
    bucket.push(tender);
    byTier.set(tender.relevance.tier, bucket);
  }
  const kept = tenders.filter((t) => t.relevance.tier !== "excluded");

  console.log(`\n分级结果（共 ${total} 条）`);
  for (const tier of TIER_ORDER) {
    const count = byTier.get(tier)?.length ?? 0;
    console.log(`  ${tier.padEnd(12)} ${String(count).padStart(6)}  ${pct(count, total)}`);
  }
  console.log(`  ${"→ 进入推荐".padEnd(10)} ${String(kept.length).padStart(6)}  ${pct(kept.length, total)}`);

  const withValue = tenders.filter((t) => t.estimatedValue !== undefined);
  const noValue = total - withValue.length;
  console.log(`\n金额覆盖率：${withValue.length} 条有金额（${pct(withValue.length, total)}），${noValue} 条没有（${pct(noValue, total)}）`);
  const noValueKept = kept.filter((t) => t.estimatedValue === undefined).length;
  console.log(`  没有金额但仍被保留：${noValueKept} 条（靠关键词，不靠门槛）`);
  const currencies = new Map<string, number>();
  for (const tender of withValue) currencies.set(tender.currency ?? "?", (currencies.get(tender.currency ?? "?") ?? 0) + 1);
  console.log(`  币种：${[...currencies].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join("、") || "（无）"}`);

  const scopes = new Map<string, number>();
  for (const tender of tenders) scopes.set(tender.scopeType, (scopes.get(tender.scopeType) ?? 0) + 1);
  console.log(`\n采购类型：${[...scopes].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join("、")}`);

  // Grouped by the reason string rather than by rule, because the four
  // exclusion branches deliberately share one generic reason today — this is
  // the cheapest place the cost of that shows up, and worth seeing.
  const reasons = new Map<string, number>();
  for (const tender of byTier.get("excluded") ?? []) {
    reasons.set(tender.relevance.reason.zh, (reasons.get(tender.relevance.reason.zh) ?? 0) + 1);
  }
  console.log(`\n排除原因分布：`);
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(6)}  ${reason.slice(0, 90)}`);
  }

  const ranked = [...kept].sort((a, b) => (usdOf(b) ?? -1) - (usdOf(a) ?? -1));
  console.log(`\n保留项目（按美元金额降序，最多 ${examples} 条）：`);
  for (const tender of ranked.slice(0, examples)) {
    const usd = usdOf(tender);
    const amount = usd === null ? "      无金额" : `${(usd / 1_000_000).toFixed(2).padStart(9)}M USD`;
    console.log(`  ${tender.relevance.tier.padEnd(11)} ${tender.scopeType.padEnd(9)} ${amount}  ${tender.title.es.slice(0, 90)}`);
  }
  if (ranked.length > examples) console.log(`  …还有 ${ranked.length - examples} 条，见 CSV。`);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const keptPath = writeReviewCsv({
    dir: options.outDir ?? "exports",
    baseName: `${exportBaseName}-kept-${dateStamp}`,
    csv: toCsv(REVIEW_CSV_HEADERS, kept.map(reviewCsvRow)),
    label,
  });
  const excludedPath = writeReviewCsv({
    dir: options.outDir ?? "exports",
    baseName: `${exportBaseName}-excluded-${dateStamp}`,
    csv: toCsv(REVIEW_CSV_HEADERS, (byTier.get("excluded") ?? []).map(reviewCsvRow)),
    label,
  });
  if (keptPath) console.log(`\n写入 ${kept.length} 条保留 -> ${keptPath}`);
  if (excludedPath) console.log(`写入 ${(byTier.get("excluded") ?? []).length} 条排除 -> ${excludedPath}`);
  if (keptPath) console.log(`看是哪条规则留下的：npm run explain:kept -- ${keptPath}`);
}
