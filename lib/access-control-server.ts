import "server-only";
import { TRIAL_DAYS, type SubscriptionPlan, type ViewerEntitlement, type ViewerRole } from "@/lib/access-control";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

const EMPTY: ViewerEntitlement = { role: "guest", plan: null, trialEndsAt: null, subscriptionOwnerUserId: null, isEnterpriseOwner: false };

function isCurrent(subscription: { current_period_end?: string | null }) {
  return !subscription.current_period_end || new Date(subscription.current_period_end).getTime() >= Date.now();
}

export async function getViewerEntitlement(): Promise<ViewerEntitlement> {
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

  const { data: membershipsById } = await admin.from("enterprise_members").select("owner_user_id").eq("member_user_id", user.id).limit(1);
  const { data: membershipsByEmail } = !membershipsById?.length && user.email
    ? await admin.from("enterprise_members").select("owner_user_id").ilike("email", user.email).limit(1)
    : { data: [] };
  const ownerId = (membershipsById?.[0]?.owner_user_id ?? membershipsByEmail?.[0]?.owner_user_id) as string | undefined;
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
}

export async function getViewerRole(): Promise<ViewerRole> {
  return (await getViewerEntitlement()).role;
}
