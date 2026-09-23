import "server-only";
import Stripe from "stripe";
import type { BillingInterval } from "@/lib/access-control";
import { parsePaidPlanSelection, PLAN_PRICES_USD } from "@/lib/billing-catalog";

export type StripePlan = "basic" | "professional" | "enterprise";

const PRICE_IDS: Record<StripePlan, string | undefined> = {
  basic: process.env.STRIPE_PRICE_BASIC_MONTHLY,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
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
  interval: "monthly";
  priceId: string;
} | null {
  const selection = parsePaidPlanSelection(plan, interval);
  if (!selection) return null;
  const priceId = PRICE_IDS[selection.plan]?.trim();
  return priceId ? { ...selection, priceId } : null;
}

export async function hasCurrentStripePrice(plan: StripePlan): Promise<boolean> {
  const selected = parseStripeSelection(plan, "monthly");
  const stripe = getStripeClient();
  if (!selected || !stripe) return false;
  try {
    const price = await stripe.prices.retrieve(selected.priceId);
    return price.active && price.currency === "usd" && price.recurring?.interval === "month"
      && price.recurring.interval_count === 1
      && price.unit_amount === PLAN_PRICES_USD[plan].monthly * 100;
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
    if (PRICE_IDS[plan]?.trim() === priceId) return { plan, interval: "monthly" };
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
