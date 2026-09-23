/** The only prices offered to new customers. Stripe's monthly Price objects
 * must match these amounts; checkout verifies the amount before charging. */
export const PLAN_PRICES_USD = {
  basic: { monthly: 99 },
  professional: { monthly: 199 },
  enterprise: { monthly: 399 },
} as const;

export const PLAN_NAMES = {
  basic: "基础个人版",
  professional: "专业个人版",
  enterprise: "专业企业版",
} as const;

export type PaidPlan = keyof typeof PLAN_PRICES_USD;
export const USD_CNY_REFERENCE_RATE = 6.7459;

/** Plan navigation must not depend on Stripe Price IDs being configured. */
export function parsePaidPlanSelection(plan: string | null, interval: string | null): { plan: PaidPlan; interval: "monthly" } | null {
  if (interval !== "monthly") return null;
  if (plan !== "basic" && plan !== "professional" && plan !== "enterprise") return null;
  return { plan, interval: "monthly" };
}

export function bankTransferQuote(plan: PaidPlan, usdMxnRate: number) {
  const usdAmount = PLAN_PRICES_USD[plan].monthly;
  return {
    usdAmount,
    mxnAmount: Math.round(usdAmount * usdMxnRate * 100) / 100,
    mxnAmountCentavos: Math.round(usdAmount * usdMxnRate * 100),
  };
}
