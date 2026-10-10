/**
 * What a tender's 一句话总结 may change about the tender — one rule, shared by
 * document analysis (applied as soon as the summary is written) and the
 * one-off `npm run align:summary-amounts`.
 *
 * User, 2026-10-10:
 *   - 一句话总结里面提到的项目预算金额 vs 我自己手动填写的预算金额，如果有差异，
 *     把我的替换成一句话总结的金额+规模调整 / 也要比较我改的金额
 *   - 一句话总结里面如果识别到超长期项目（2年），就归为最少中型项目，3年调整成大项目
 *   - 后续标书分析后，可以基于总结调整标书内容，但是不要基于总结把标书直接屏蔽
 *     （常规排除）
 *
 * Amount (lib/ingestion/summary-amount.ts reads it):
 *   - no stored amount → the summary's fills it (when fillEmpty);
 *   - an amount an admin TYPED (estimated_value in manual_field_overrides)
 *     that differs by more than 5% → replaced, unless the currencies differ
 *     (the model converted) or they are more than 5× apart (a unit slip);
 *   - an amount the import took from the source → never touched. On the
 *     first live run 10 of 14 such mismatches were the summary's mistake,
 *     checked against PNCP and SECOP.
 * Tier:
 *   - when the amount changes, re-tiered on it through classifyStoredTender
 *     (the import's own rule, long-contract floor included);
 *   - otherwise only the long-contract floor (applySummaryDurationFloor),
 *     which only ever raises, and only for a tender with no amount at all
 *     (有金额的以金额为主，没有金额的才用时长评估);
 *   - NEVER to 已过滤: whatever the summary says, a kept tender stays kept.
 *     Exclusion is the platform's own rules' call, made at import;
 *   - a tier an admin locked is never moved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applySummaryDurationFloor, classifyStoredTender } from "@/lib/relevance";
import { convertToUsd } from "@/lib/currency";
import { amountsInSummary, type SummaryAmount } from "@/lib/ingestion/summary-amount";
import type { LocalizedText, TenderRelevanceTier } from "@/types/tender";

const TOLERANCE = 0.05;
const MAX_RATIO = 5;
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

/** The stored columns the rule reads. */
export type SummaryAdjustmentRow = {
  slug: string;
  tender_number: string;
  title: { es?: string; zh?: string } | null;
  summary: { es?: string; zh?: string } | null;
  one_line_summary: string | null;
  buyer: string;
  country: string;
  procedure_type: string | null;
  government_level: string;
  scope_type: string;
  estimated_value: number | null;
  currency: string | null;
  source_name: string;
  structured_duration_days: number | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
  manual_field_overrides: string[] | null;
};

export const SUMMARY_ADJUSTMENT_COLUMNS =
  "slug, tender_number, title, summary, one_line_summary, buyer, country, procedure_type, government_level, scope_type, estimated_value, currency, source_name, structured_duration_days, relevance_tier, relevance_manually_overridden, manual_field_overrides";

export type AmountCase =
  | "none" // the summary names no budget
  | "ambiguous" // two budgets, or a figure without a currency next to one
  | "unconvertible"
  | "same" // within 5%
  | "fill" // no stored amount
  | "replace" // a typed amount the summary corrects
  | "typed-suspicious" // a typed amount, but different currency or > 5× apart
  | "source-mismatch"; // the source's amount disagrees — the source wins

export type SummaryAdjustmentPlan = {
  amountCase: AmountCase;
  summaryAmount?: SummaryAmount;
  ambiguousAmounts?: SummaryAmount[];
  /** Set when the plan writes an amount. */
  newAmount?: { value: number; currency: string };
  tierFrom: TenderRelevanceTier;
  /** Equal to tierFrom when the tier stays. */
  tierTo: TenderRelevanceTier;
  label: LocalizedText;
  reason: LocalizedText;
  /** Why the tier did NOT move where the amount pointed, for a human. */
  tierNote: string | null;
};

const usd = (value: number | null | undefined, currency: string | null | undefined) =>
  value === null || value === undefined ? null : convertToUsd(value, currency ?? undefined);

export function planSummaryAdjustment(row: SummaryAdjustmentRow, options: { fillEmpty?: boolean } = {}): SummaryAdjustmentPlan {
  const fillEmpty = options.fillEmpty ?? true;
  const tierFrom = row.relevance_tier ?? "standard";
  const locked = row.relevance_manually_overridden === true;
  const empty: LocalizedText = { zh: "", en: "", es: "" };

  // Tier when the amount stays: the long-contract floor only.
  const floorOnly = (amountCase: AmountCase, extra: Partial<SummaryAdjustmentPlan> = {}): SummaryAdjustmentPlan => {
    const floored = applySummaryDurationFloor({ tier: tierFrom, label: empty, reason: empty }, row.one_line_summary, row.estimated_value !== null);
    if (floored.tier === tierFrom) return { amountCase, tierFrom, tierTo: tierFrom, label: empty, reason: empty, tierNote: null, ...extra };
    if (locked) return { amountCase, tierFrom, tierTo: tierFrom, label: empty, reason: empty, tierNote: `人工锁定，分级不动（长期合同会是${TIER_ZH[floored.tier]}）`, ...extra };
    return { amountCase, tierFrom, tierTo: floored.tier, label: floored.label, reason: floored.reason, tierNote: null, ...extra };
  };

  const result = amountsInSummary(row.one_line_summary, row.country);
  if (result.kind === "none") return floorOnly("none");
  if (result.kind === "ambiguous") return floorOnly("ambiguous", { ambiguousAmounts: result.amounts });

  const amount = result.amount;
  const summaryUsd = usd(amount.value, amount.currency);
  const storedUsd = usd(row.estimated_value, row.currency);
  if (summaryUsd === null) return floorOnly("unconvertible", { summaryAmount: amount });
  if (storedUsd !== null && Math.abs(summaryUsd - storedUsd) <= storedUsd * TOLERANCE) return floorOnly("same", { summaryAmount: amount });

  let amountCase: AmountCase;
  if (row.estimated_value === null) {
    amountCase = "fill";
  } else if (!(row.manual_field_overrides ?? []).includes("estimated_value")) {
    amountCase = "source-mismatch";
  } else {
    const ratio = storedUsd ? summaryUsd / storedUsd : null;
    amountCase = amount.currency !== row.currency || (ratio !== null && (ratio > MAX_RATIO || ratio < 1 / MAX_RATIO)) ? "typed-suspicious" : "replace";
  }
  const writes = amountCase === "replace" || (amountCase === "fill" && fillEmpty);
  if (!writes) return floorOnly(amountCase, { summaryAmount: amount });

  const { relevance } = classifyStoredTender({
    title: row.title?.es ?? "",
    summary: row.summary?.es ?? "",
    buyer: row.buyer,
    country: row.country,
    procedureType: row.procedure_type ?? undefined,
    tenderNumber: row.tender_number,
    governmentLevel: row.government_level as Parameters<typeof classifyStoredTender>[0]["governmentLevel"],
    scopeType: row.scope_type as Parameters<typeof classifyStoredTender>[0]["scopeType"],
    estimatedValue: amount.value,
    currency: amount.currency,
    sourceName: row.source_name,
    structuredDurationDays: row.structured_duration_days ?? undefined,
    oneLineSummary: row.one_line_summary,
  });
  const base = { amountCase, summaryAmount: amount, newAmount: { value: amount.value, currency: amount.currency }, tierFrom };
  if (locked) {
    return { ...base, tierTo: tierFrom, label: empty, reason: empty, tierNote: relevance.tier !== tierFrom ? `人工锁定，分级不动（按新金额会是${TIER_ZH[relevance.tier]}）` : "人工锁定" };
  }
  if (relevance.tier === "excluded" && tierFrom !== "excluded") {
    // 不要基于总结把标书直接屏蔽: a summary never takes a tender out.
    return { ...base, tierTo: tierFrom, label: empty, reason: empty, tierNote: "按新金额会被过滤，但总结不会导致排除，分级保持不动" };
  }
  return { ...base, tierTo: relevance.tier, label: relevance.label, reason: relevance.reason, tierNote: null };
}

/** The columns a plan writes; null when it writes nothing. */
export function summaryAdjustmentPatch(plan: SummaryAdjustmentPlan): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  // A filled amount is NOT added to manual_field_overrides: if the source
  // publishes an exact figure later, that figure should win. (A replaced one
  // is already there — that is what made it replaceable.)
  if (plan.newAmount) Object.assign(patch, { estimated_value: plan.newAmount.value, currency: plan.newAmount.currency });
  if (plan.tierTo !== plan.tierFrom) Object.assign(patch, { relevance_tier: plan.tierTo, relevance_label: plan.label, relevance_reason: plan.reason });
  return Object.keys(patch).length > 0 ? patch : null;
}

/** One line for the analysis result, in the operator's language. */
export function describeSummaryAdjustment(plan: SummaryAdjustmentPlan): string | null {
  const parts: string[] = [];
  if (plan.newAmount) parts.push(`${plan.amountCase === "fill" ? "按一句话总结补上金额" : "按一句话总结修正金额"} ${plan.newAmount.value.toLocaleString("en-US")} ${plan.newAmount.currency}`);
  if (plan.tierTo !== plan.tierFrom) parts.push(`规模 ${TIER_ZH[plan.tierFrom]}→${TIER_ZH[plan.tierTo]}`);
  if (plan.tierNote && plan.tierNote !== "人工锁定") parts.push(plan.tierNote);
  return parts.length > 0 ? parts.join("；") : null;
}

/**
 * Read the tender, plan, write. Called right after document analysis writes a
 * 一句话总结. Returns the line to show the operator, or null if nothing changed.
 */
export async function applySummaryAdjustment(supabase: SupabaseClient, tenderId: string): Promise<string | null> {
  const { data, error } = await supabase.from("tenders").select(SUMMARY_ADJUSTMENT_COLUMNS).eq("id", tenderId).maybeSingle();
  if (error || !data) return null;
  const plan = planSummaryAdjustment(data as unknown as SummaryAdjustmentRow);
  const patch = summaryAdjustmentPatch(plan);
  if (!patch) return null;
  const { error: writeError } = await supabase.from("tenders").update(patch).eq("id", tenderId);
  if (writeError) return `按一句话总结调整失败：${writeError.message}`;
  return describeSummaryAdjustment(plan);
}
