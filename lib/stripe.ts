import "server-only";
import Stripe from "stripe";
import type { BillingInterval } from "@/lib/access-control";

export type StripePlan = "professional" | "enterprise";

const PRICE_IDS: Record<StripePlan, Record<BillingInterval, string | undefined>> = {
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    semiannual: process.env.STRIPE_PRICE_PROFESSIONAL_SEMIANNUAL,
    annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    semiannual: process.env.STRIPE_PRICE_ENTERPRISE_SEMIANNUAL,
    annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
  },
};

let stripeClient: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  stripeClient = secretKey ? new Stripe(secretKey) : null;
  return stripeClient;
}

export function parseStripeSelection(plan: string | null, interval: string | null): {
  plan: StripePlan;
  interval: BillingInterval;
  priceId: string;
} | null {
  if (plan !== "professional" && plan !== "enterprise") return null;
  if (interval !== "monthly" && interval !== "semiannual" && interval !== "annual") return null;
  const priceId = PRICE_IDS[plan][interval]?.trim();
  return priceId ? { plan, interval, priceId } : null;
}

export function stripeSelectionFromPriceId(priceId: string): {
  plan: StripePlan;
  interval: BillingInterval;
} | null {
  const plans: StripePlan[] = ["professional", "enterprise"];
  const intervals: BillingInterval[] = ["monthly", "semiannual", "annual"];
  for (const plan of plans) {
    for (const interval of intervals) {
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
