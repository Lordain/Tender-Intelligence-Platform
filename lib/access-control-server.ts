import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectPreferredSubscription, TRIAL_DAYS, type BillingInterval, type SubscriptionPlan, type ViewerEntitlement, type ViewerRole } from "@/lib/access-control";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

const EMPTY: ViewerEntitlement = { role: "guest", plan: null, trialEndsAt: null, subscriptionOwnerUserId: null, isEnterpriseOwner: false, periodStart: null, periodEnd: null, cancelAtPeriodEnd: false, billingInterval: null, paymentPastDue: false, hasBillingLink: false };

type SubscriptionRow = {
  user_id: string;
  plan: string;
  status: string;
  created_at: string | null;
  current_period_end: string | null;
  current_period_start?: string | null;
  cancel_at_period_end?: boolean;
  billing_interval?: string | null;
  stripe_subscription_id?: string | null;
};

const SUBSCRIPTION_COLUMNS =
  "user_id, plan, status, created_at, current_period_end, current_period_start, cancel_at_period_end, billing_interval, stripe_subscription_id";
/** Migrations 0026 and 0027 add the columns above; this is what came before them. */
const SUBSCRIPTION_COLUMNS_LEGACY = "user_id, plan, status, created_at, current_period_end";

/**
 * The one active subscription that still covers today, or undefined.
 *
 * Two things this deliberately does NOT do. It does not retry on any error:
 * only PostgREST's undefined_column (42703) means "migration 0026 has not
 * reached this database yet", and retrying anything else would turn a
 * transient failure into a silent answer of "no subscription" — which
 * downgrades a paying customer to the free tier, tells them to subscribe for
 * something they already bought, and leaves nothing in the logs to explain
 * it. And it does not swallow the second error either: a 500 from an error
 * boundary is recoverable and visible; a wrong entitlement is neither.
 */
async function findCurrentSubscription(
  admin: SupabaseClient,
  userId: string,
  plan?: "enterprise",
): Promise<SubscriptionRow | undefined> {
  const run = (columns: string) => {
    const query = admin
      .from("subscriptions")
      .select(columns)
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false });
    return plan ? query.eq("plan", plan) : query;
  };

  let result = await run(SUBSCRIPTION_COLUMNS);
  if (result.error?.code === "42703") result = await run(SUBSCRIPTION_COLUMNS_LEGACY);
  if (result.error) throw new Error(`订阅读取失败：${result.error.message}`);

  return selectPreferredSubscription((result.data ?? []) as unknown as SubscriptionRow[]);
}

function periodOf(subscription: SubscriptionRow) {
  return {
    periodStart: subscription.current_period_start ?? subscription.created_at ?? null,
    periodEnd: subscription.current_period_end ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    billingInterval: (subscription.billing_interval ?? null) as BillingInterval | null,
    paymentPastDue: subscription.status === "past_due",
    // Only a payment provider's webhook can move current_period_end forward.
    // Without a subscription on that provider's side, the period end is
    // simply when access stops.
    hasBillingLink: Boolean(subscription.stripe_subscription_id),
  };
}

/**
 * Memoized per request: resolving an entitlement costs an auth round-trip
 * plus up to three Supabase queries, and both the page and any route handler
 * in the same request want the same answer.
 */
export const getViewerEntitlement = cache(async (): Promise<ViewerEntitlement> => {
  const user = await getCurrentUser();
  if (!user) return EMPTY;

  const admin = createSupabaseAdminClient();
  const fallbackEnd = new Date(new Date(user.created_at).getTime() + TRIAL_DAYS * 86_400_000).toISOString();
  if (!admin) {
    return { ...EMPTY, role: new Date(fallbackEnd).getTime() > Date.now() ? "trial" : "free", trialEndsAt: fallbackEnd };
  }

  const own = await findCurrentSubscription(admin, user.id);
  if (own) {
    return {
      ...EMPTY,
      role: "subscriber",
      plan: own.plan as SubscriptionPlan,
      subscriptionOwnerUserId: user.id,
      isEnterpriseOwner: own.plan === "enterprise",
      ...periodOf(own),
    };
  }

  // A seat is granted by an ACCEPTED invitation bound to THIS account, never
  // by the email address alone. Matching on the address was how a mistyped
  // invitation handed a stranger a paid seat without ever asking the person
  // named on it — see migration 0025.
  const { data: memberships } = await admin
    .from("enterprise_members")
    .select("owner_user_id")
    .eq("member_user_id", user.id)
    .eq("status", "accepted")
    .limit(1);
  const ownerId = memberships?.[0]?.owner_user_id as string | undefined;
  if (ownerId) {
    const owner = await findCurrentSubscription(admin, ownerId, "enterprise");
    if (owner) {
      return {
        ...EMPTY,
        role: "subscriber",
        plan: "enterprise",
        subscriptionOwnerUserId: ownerId,
        isEnterpriseOwner: false,
        ...periodOf(owner),
      };
    }
  }

  // Same reasoning as above: a swallowed error here silently falls back to
  // "signup + 7 days", which for any account older than a week reads as an
  // expired trial — a free tier the person never actually landed in.
  const { data: profile, error: profileError } = await admin.from("profiles").select("trial_ends_at").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error(`试用状态读取失败：${profileError.message}`);
  const trialEndsAt = (profile?.trial_ends_at as string | undefined) ?? fallbackEnd;
  const role = new Date(trialEndsAt).getTime() > Date.now() ? "trial" : "free";
  return { ...EMPTY, role, trialEndsAt, periodStart: role === "trial" ? new Date(new Date(trialEndsAt).getTime() - TRIAL_DAYS * 86_400_000).toISOString() : null, periodEnd: role === "trial" ? trialEndsAt : null };
});

export async function getViewerRole(): Promise<ViewerRole> {
  return (await getViewerEntitlement()).role;
}
