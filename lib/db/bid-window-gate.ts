import { SHORT_BID_WINDOW_DAYS } from "@/lib/ingestion/recency";
import { SHORT_BID_WINDOW_EXCLUSION_REASON } from "@/lib/relevance";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
import { platformDay } from "@/lib/tender-status";
import type { LocalizedText, TenderRelevanceTier } from "@/types/tender";

/**
 * The bidding-window rule, applied to a row that ALREADY EXISTS.
 *
 * ── Why there are two homes for one rule ──────────────────────────────────
 *
 * At import, `upsertTendersBatched()` applies it by simply not writing the
 * row: nothing is stored, so nothing needs marking. That covers every
 * automated source.
 *
 * It does not cover Peru, which is the case the user actually asked about
 * (2026-09-19): SEACE publishes its cronograma only on the ficha page, so
 * Peruvian deadlines are typed in BY HAND afterwards. At import those rows
 * have no deadline at all, so the gate cannot fire, and the window only comes
 * into existence at the moment an admin saves the date. That save is the
 * second home.
 *
 * ── Both directions, on purpose ───────────────────────────────────────────
 *
 * A one-way rule would make a typo permanent: enter 09-05 instead of 09-25,
 * the row is excluded, fix the date and it stays excluded with nothing to
 * show why. So this also RESTORES — but only a row it excluded itself, which
 * it recognises by the reason it wrote. A row excluded for being a routine
 * service, or by an admin's own hand, is never touched.
 *
 * Restoring to `standard` is exact rather than a guess: the rule only ever
 * fires on `standard`, so that is the only tier it can ever have taken away.
 *
 * ── What it refuses to touch ──────────────────────────────────────────────
 *
 * `relevance_manually_overridden` wins outright. That flag is the user's own
 * lock, and it already beats the importer and the reclassifier; a date edit
 * is not the place to start ignoring it.
 *
 * So does a tier the admin is setting in the same save. Choosing a tier by
 * hand and having it overwritten by a side effect of the date field in the
 * same form submission would be indistinguishable from a bug.
 */

export type BidWindowDecision =
  | { action: "exclude"; patch: RelevancePatch }
  | { action: "restore"; patch: RelevancePatch }
  | null;

type RelevancePatch = {
  relevance_tier: TenderRelevanceTier;
  relevance_label: LocalizedText;
  relevance_reason: LocalizedText;
};

export type BidWindowInput = {
  currentTier: TenderRelevanceTier | null;
  currentReason: LocalizedText | null;
  manuallyOverridden: boolean;
  /** Null/undefined means undisclosed, which is half of what this rule keys on. */
  estimatedValue: number | null | undefined;
  publicationDate: string | null | undefined;
  /** True means publicationDate is the ingest timestamp — see hasShortBidWindow(). */
  publicationDateIsEstimated: boolean | null | undefined;
  submissionDeadline: string | null | undefined;
};

/** Whether this row's stored reason is the one this module writes. */
function wasExcludedByThisRule(reason: LocalizedText | null): boolean {
  return reason?.zh === SHORT_BID_WINDOW_EXCLUSION_REASON.zh;
}

/**
 * Whole calendar days between two dates, or null when either is unusable.
 *
 * Built from the date PARTS rather than Date.parse for the reason platformDay's
 * own header documents: these are calendar days, and reading one as an instant
 * shifts it a day earlier in every UTC-minus timezone.
 */
function calendarDaysBetween(from: string, to: string): number | null {
  const fromDay = platformDay(from);
  const toDay = platformDay(to);
  if (!fromDay || !toDay) return null;
  const parse = (day: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const a = parse(fromDay);
  const b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

const RESTORED_REASON: LocalizedText = {
  zh: `交标日期修改后，从发布到交标已满 ${SHORT_BID_WINDOW_DAYS} 个自然日，因投标窗口过短而排除的判定已自动撤销，恢复为常规项目。`,
  en: `After the deadline was edited, publication to bid close is now at least ${SHORT_BID_WINDOW_DAYS} calendar days, so the short-bidding-window exclusion was lifted automatically and this is a standard tender again.`,
  es: `Tras editarse la fecha, de la convocatoria al cierre hay al menos ${SHORT_BID_WINDOW_DAYS} días naturales, así que la exclusión por plazo demasiado corto se levantó automáticamente y vuelve a ser una licitación estándar.`,
};

export function decideBidWindow(input: BidWindowInput): BidWindowDecision {
  if (input.manuallyOverridden) return null;

  const days =
    input.publicationDate && input.submissionDeadline && input.publicationDateIsEstimated !== true
      ? calendarDaysBetween(input.publicationDate, input.submissionDeadline)
      : null;
  const windowIsShort = days !== null && days < SHORT_BID_WINDOW_DAYS;

  if (
    windowIsShort &&
    input.currentTier === "standard" &&
    (input.estimatedValue === null || input.estimatedValue === undefined)
  ) {
    return {
      action: "exclude",
      patch: {
        relevance_tier: "excluded",
        relevance_label: RELEVANCE_TIER_LABELS.excluded,
        relevance_reason: SHORT_BID_WINDOW_EXCLUSION_REASON,
      },
    };
  }

  if (!windowIsShort && input.currentTier === "excluded" && wasExcludedByThisRule(input.currentReason)) {
    return {
      action: "restore",
      patch: {
        relevance_tier: "standard",
        relevance_label: RELEVANCE_TIER_LABELS.standard,
        relevance_reason: RESTORED_REASON,
      },
    };
  }

  return null;
}
