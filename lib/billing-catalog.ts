import type { BillingInterval } from "@/lib/access-control";

export const BILLING_MONTHS: Record<BillingInterval, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

/**
 * The standard price — what a plan costs when no promotion is running, and
 * what the promotional price is shown struck through against.
 *
 * Nothing charges from this table. It exists so the discount on the pricing
 * page is derived from two real numbers rather than written down a third
 * time, and so restoring normal pricing when the promotion ends is copying
 * this block over PLAN_PRICES_USD rather than remembering six figures.
 */
export const PLAN_LIST_PRICES_USD = {
  professional: { monthly: 1000, semiannual: 5400, annual: 9600 },
  enterprise: { monthly: 2000, semiannual: 10800, annual: 19200 },
} as const;

/**
 * A limited-time promotion, 2026-09.
 *
 * `endsAt` is deliberately nullable and deliberately not guessed: with a date
 * the page names it, without one it says 限时优惠 and no more. A deadline
 * printed to customers has to be a decision someone made, not a placeholder —
 * and an expired date sitting in a shipped page is worse than none.
 *
 * Nothing here expires on its own. When the promotion ends, someone copies
 * PLAN_LIST_PRICES_USD over PLAN_PRICES_USD, flips `active`, AND swaps the
 * six STRIPE_PRICE_* environment variables back. The code change alone is not
 * enough — see the warning on PLAN_PRICES_USD.
 */
export const PROMOTION = {
  active: true,
  label: "限时优惠",
  /** ISO date, e.g. "2026-10-31". null = no date shown. */
  endsAt: null as string | null,
} as const;

/**
 * What a plan costs RIGHT NOW — the promotional price while PROMOTION.active,
 * the list price otherwise. Every consumer reads this one: the pricing page,
 * the bank-transfer quote, the manual wire amount, and revenue analytics.
 *
 * ⚠️ CHANGING THIS ALONE IS NOT A PRICE CHANGE, and the two payment paths
 * break in different directions if you try:
 *
 *   - CARD checkout charges the Stripe Price object directly
 *     (app/api/stripe/checkout/route.ts builds line_items from
 *     STRIPE_PRICE_*). Lower this table without creating new Stripe Prices
 *     and the page advertises the discount while the card is charged the old
 *     amount — silently, with nothing failing. That is the dangerous one.
 *   - BANK TRANSFER builds its amount from this table and then reconciles it
 *     against the Stripe Price, refusing the purchase when they disagree.
 *     That one fails loudly, which is the behaviour you want.
 *
 * Stripe Prices are immutable by design, so a promotion means creating six
 * NEW Price objects and repointing the six STRIPE_PRICE_* variables at them.
 */
export const PLAN_PRICES_USD = {
  professional: { monthly: 800, semiannual: 4200, annual: 7200 },
  enterprise: { monthly: 1600, semiannual: 8400, annual: 14400 },
} as const;

export const PLAN_NAMES = {
  professional: "个人版",
  enterprise: "企业版",
} as const;

export type PaidPlan = keyof typeof PLAN_PRICES_USD;

/** How much the current price saves against the list price, as a whole percent. 0 when there is nothing to show. */
export function promotionSavingPercent(plan: PaidPlan, interval: BillingInterval): number {
  if (!PROMOTION.active) return 0;
  const list = PLAN_LIST_PRICES_USD[plan][interval];
  const now = PLAN_PRICES_USD[plan][interval];
  if (list <= now) return 0;
  return Math.round((1 - now / list) * 100);
}

export function bankTransferQuote(plan: PaidPlan, interval: BillingInterval, usdMxnRate: number) {
  const usdAmount = PLAN_PRICES_USD[plan][interval];
  return {
    usdAmount,
    mxnAmount: Math.round(usdAmount * usdMxnRate * 100) / 100,
    mxnAmountCentavos: Math.round(usdAmount * usdMxnRate * 100),
  };
}
