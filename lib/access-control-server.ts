import "server-only";
import { cache } from "react";
import { TRIAL_DAYS, type SubscriptionPlan, type ViewerEntitlement, type ViewerRole } from "@/lib/access-control";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

const EMPTY: ViewerEntitlement = { role: "guest", plan: null, trialEndsAt: null, subscriptionOwnerUserId: null, isEnterpriseOwner: false };

function isCurrent(subscription: { current_period_end?: string | null }) {
  return !subscription.current_period_end || new Date(subscription.current_period_end).getTime() >= Date.now();
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

  const { data: ownSubscriptions } = await admin.from("subscriptions")
    .select("user_id, plan, status, current_period_end")
    .eq("user_id", user.id).in("status", ["active", "trialing"]);
  const own = (ownSubscriptions ?? []).find(isCurrent);
  if (own) {
    return { role: "subscriber", plan: own.plan as SubscriptionPlan, trialEndsAt: null, subscriptionOwnerUserId: user.id, isEnterpriseOwner: own.plan === "enterprise" };
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
    const { data: ownerSubscriptions } = await admin.from("subscriptions")
      .select("user_id, plan, status, current_period_end")
      .eq("user_id", ownerId).eq("plan", "enterprise").in("status", ["active", "trialing"]);
    if ((ownerSubscriptions ?? []).some(isCurrent)) {
      return { role: "subscriber", plan: "enterprise", trialEndsAt: null, subscriptionOwnerUserId: ownerId, isEnterpriseOwner: false };
    }
  }

  const { data: profile } = await admin.from("profiles").select("trial_ends_at").eq("id", user.id).maybeSingle();
  const trialEndsAt = (profile?.trial_ends_at as string | undefined) ?? fallbackEnd;
  return { role: new Date(trialEndsAt).getTime() > Date.now() ? "trial" : "free", plan: null, trialEndsAt, subscriptionOwnerUserId: null, isEnterpriseOwner: false };
});

export async function getViewerRole(): Promise<ViewerRole> {
  return (await getViewerEntitlement()).role;
}
