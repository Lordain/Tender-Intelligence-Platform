import "server-only";
import Stripe from "stripe";
import type { BillingInterval } from "@/lib/access-control";
import { parsePaidPlanSelection, planPriceUsd, type PaidInterval } from "@/lib/billing-catalog";

export type StripePlan = "basic" | "professional" | "enterprise";

/**
 * One Stripe Price per plan and cycle. The annual ones (STRIPE_PRICE_*_ANNUAL)
 * were added 2026-09-28; until they are created in Stripe and set here, card
 * and SPEI checkout are closed for annual and the international wire, which
 * needs no Stripe Price, is the way to buy a year.
 */
const PRICE_IDS: Record<StripePlan, Record<PaidInterval, string | undefined>> = {
  basic: { monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY, annual: process.env.STRIPE_PRICE_BASIC_ANNUAL },
  professional: { monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY, annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL },
  enterprise: { monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY, annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL },
};

const STRIPE_RECURRING: Record<PaidInterval, "month" | "year"> = { monthly: "month", annual: "year" };

let stripeClient: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  stripeClient = secretKey ? new Stripe(secretKey) : null;
  return stripeClient;
}

export function parseStripeSelection(plan: string | null, interval: string | null): {
  plan: StripePlan;
  interval: PaidInterval;
  priceId: string;
} | null {
  const selection = parsePaidPlanSelection(plan, interval);
  if (!selection) return null;
  const priceId = PRICE_IDS[selection.plan][selection.interval]?.trim();
  return priceId ? { ...selection, priceId } : null;
}

/** Whether a Stripe Price charges exactly the catalog amount for this plan and cycle. */
export function stripePriceMatches(price: Stripe.Price, plan: StripePlan, interval: PaidInterval): boolean {
  return price.active && price.currency === "usd" && price.recurring?.interval === STRIPE_RECURRING[interval]
    && price.recurring.interval_count === 1
    && price.unit_amount === planPriceUsd(plan, interval) * 100;
}

export function stripeRecurringFor(interval: PaidInterval): { interval: "month" | "year"; interval_count: 1 } {
  return { interval: STRIPE_RECURRING[interval], interval_count: 1 };
}

export async function hasCurrentStripePrice(plan: StripePlan, interval: PaidInterval = "monthly"): Promise<boolean> {
  const selected = parseStripeSelection(plan, interval);
  const stripe = getStripeClient();
  if (!selected || !stripe) return false;
  try {
    return stripePriceMatches(await stripe.prices.retrieve(selected.priceId), plan, interval);
  } catch {
    return false;
  }
}

export function stripeSelectionFromPriceId(priceId: string): {
  plan: StripePlan;
  interval: BillingInterval;
} | null {
  const plans: StripePlan[] = ["basic", "professional", "enterprise"];
  for (const plan of plans) {
    for (const interval of ["monthly", "annual"] as const) {
      if (PRICE_IDS[plan][interval]?.trim() === priceId) return { plan, interval };
    }
  }
  return null;
}

export function stripeObjectId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function stripeSubscriptionPeriod(subscription: Stripe.Subscription): {
  periodStart: string | null;
  periodEnd: string | null;
} {
  const items = subscription.items.data;
  if (items.length === 0) return { periodStart: null, periodEnd: null };
  const starts = items.map((item) => item.current_period_start);
  const ends = items.map((item) => item.current_period_end);
  return {
    periodStart: new Date(Math.min(...starts) * 1000).toISOString(),
    periodEnd: new Date(Math.max(...ends) * 1000).toISOString(),
  };
}

export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}
