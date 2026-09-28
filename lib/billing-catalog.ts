/** The only prices offered to new customers. Stripe's Price objects must
 * match these amounts; checkout verifies the amount before charging.
 *
 * Annual is twelve months for the price of ten (user, 2026-09-28: 按 10 个月
 * 的价格买 12 个月) — offered because Chinese enterprises buy by the year and
 * would rather send one international wire than twelve. */
export const ANNUAL_MONTHS_CHARGED = 10;

export const PLAN_PRICES_USD = {
  basic: { monthly: 99, annual: 99 * ANNUAL_MONTHS_CHARGED },
  professional: { monthly: 199, annual: 199 * ANNUAL_MONTHS_CHARGED },
  enterprise: { monthly: 399, annual: 399 * ANNUAL_MONTHS_CHARGED },
} as const;

/** The billing cycles on sale. The database also knows "semiannual" from an older price list; it is not sold. */
export type PaidInterval = "monthly" | "annual";
export const PAID_INTERVALS: readonly PaidInterval[] = ["monthly", "annual"];

export const INTERVAL_UNIT_ZH: Record<PaidInterval, string> = { monthly: "月", annual: "年" };

export function planPriceUsd(plan: PaidPlan, interval: PaidInterval): number {
  return PLAN_PRICES_USD[plan][interval];
}

export const PLAN_NAMES = {
  basic: "基础个人版",
  professional: "专业个人版",
  enterprise: "专业企业版",
} as const;

export type PaidPlan = keyof typeof PLAN_PRICES_USD;
export const USD_CNY_REFERENCE_RATE = 6.7459;

/** Plan navigation must not depend on Stripe Price IDs being configured. */
export function parsePaidPlanSelection(plan: string | null, interval: string | null): { plan: PaidPlan; interval: PaidInterval } | null {
  if (interval !== "monthly" && interval !== "annual") return null;
  if (plan !== "basic" && plan !== "professional" && plan !== "enterprise") return null;
  return { plan, interval };
}

export function bankTransferQuote(plan: PaidPlan, usdMxnRate: number, interval: PaidInterval = "monthly") {
  const usdAmount = planPriceUsd(plan, interval);
  return {
    usdAmount,
    mxnAmount: Math.round(usdAmount * usdMxnRate * 100) / 100,
    mxnAmountCentavos: Math.round(usdAmount * usdMxnRate * 100),
  };
}
