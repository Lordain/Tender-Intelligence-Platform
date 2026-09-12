import type { BillingInterval } from "@/lib/access-control";

export const BILLING_MONTHS: Record<BillingInterval, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

export const PLAN_PRICES_USD = {
  professional: { monthly: 1000, semiannual: 5400, annual: 9600 },
  enterprise: { monthly: 2000, semiannual: 10800, annual: 19200 },
} as const;

export const PLAN_NAMES = {
  professional: "个人版",
  enterprise: "企业版",
} as const;

export type PaidPlan = keyof typeof PLAN_PRICES_USD;

export function bankTransferQuote(plan: PaidPlan, interval: BillingInterval, usdMxnRate: number) {
  const usdAmount = PLAN_PRICES_USD[plan][interval];
  return {
    usdAmount,
    mxnAmount: Math.round(usdAmount * usdMxnRate * 100) / 100,
    mxnAmountCentavos: Math.round(usdAmount * usdMxnRate * 100),
  };
}
