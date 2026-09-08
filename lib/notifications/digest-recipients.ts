/**
 * Who is entitled to the twice-daily digest. Split out of tender-digest.ts,
 * which carries the "server-only" guard — that guard throws unconditionally
 * under plain Node/tsx (it only no-ops when a bundler sets the "react-server"
 * export condition), so anything a standalone script needs cannot live behind
 * it. Same reasoning, and the same tradeoff, as lib/supabase/admin-client.ts:
 * the real protection is that SUPABASE_SERVICE_ROLE_KEY is not a NEXT_PUBLIC_
 * variable and so does not exist in a browser bundle.
 *
 * scripts/check-digest-recipients.ts imports this directly; the app reaches
 * it through tender-digest.ts, which re-exports it.
 */
// Relative, not "@/": this module is imported by scripts/*.ts running under
// tsx, which resolves paths without the Next.js bundler.
import { createSupabaseAdminClient } from "../supabase/admin-client";
import { selectPreferredSubscription } from "../access-control";

type Preference = {
  user_id: string;
  enabled: boolean;
  countries: string[];
  industries: string[];
  statuses: string[];
  relevance_tiers: string[];
  keywords: string[];
};


export type DigestRecipient = Preference & { email: string };

/**
 * Who gets the twice-daily mail: current subscribers, users still inside the
 * seven-day trial, and the seat holders on a current enterprise subscription
 * — intersected with the people who actually turned notifications on.
 *
 * The order matters. Eligibility used to be computed first, which meant
 * `profiles.select("id").gte("trial_ends_at", now)` — an unfiltered read of
 * every profile on the platform. PostgREST caps a select at 1000 rows by
 * default and returns the first page without an error, so once the table
 * passed 1000 rows the trial users beyond the cap would have silently
 * dropped off the send list with nothing in the logs. Starting from the
 * opt-ins instead bounds every query below by the (much smaller) set of
 * people who asked for mail at all. That set is itself still one page, so
 * this wants real pagination before the platform has ~1000 subscribed
 * notification opt-ins.
 */
export async function getDigestRecipients(): Promise<DigestRecipient[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the recipient list cannot be built");

  const { data: preferences, error: preferencesError } = await supabase
    .from("email_notification_preferences")
    .select("user_id, enabled, countries, industries, statuses, relevance_tiers, keywords")
    .eq("enabled", true);
  // A swallowed error here is indistinguishable from "nobody opted in", and
  // the caller would report a successful digest run having mailed no one.
  if (preferencesError) throw new Error(`通知偏好读取失败：${preferencesError.message}`);

  const enabled = (preferences ?? []) as Preference[];
  if (enabled.length === 0) return [];
  const optedInIds = [...new Set(enabled.map((preference) => preference.user_id))];

  // An enterprise seat holder is entitled through the OWNER's subscription,
  // not their own, so the owner has to be pulled in even though the owner may
  // never have enabled notifications themselves.
  //
  // ACCEPTED only. Without that filter a pending invitation counted as a
  // seat, so someone who had merely been named by an owner — and had never
  // agreed to anything — received the paid digest. Same consent rule as
  // getViewerEntitlement(); caught by qa-ent-invitee showing up in
  // check:digest-recipients.
  const { data: memberships, error: membershipsError } = await supabase
    .from("enterprise_members")
    .select("member_user_id, owner_user_id")
    .eq("status", "accepted")
    .in("member_user_id", optedInIds);
  if (membershipsError) throw new Error(`企业成员读取失败：${membershipsError.message}`);
  const ownerByMember = new Map(
    (memberships ?? []).map((row) => [row.member_user_id as string, row.owner_user_id as string]),
  );

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("user_id, plan, status, created_at, current_period_start, current_period_end")
    .in("user_id", [...new Set([...optedInIds, ...ownerByMember.values()])])
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false });
  if (subscriptionsError) throw new Error(`订阅读取失败：${subscriptionsError.message}`);
  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions ?? []) {
    const userSubscriptions = subscriptionsByUser.get(subscription.user_id) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.user_id, userSubscriptions);
  }
  const current = [...subscriptionsByUser.values()].flatMap((userSubscriptions) => {
    const selected = selectPreferredSubscription(userSubscriptions);
    return selected ? [selected] : [];
  });
  const subscriberIds = new Set(current.map((subscription) => subscription.user_id as string));
  const enterpriseOwnerIds = new Set(
    current.filter((subscription) => subscription.plan === "enterprise").map((subscription) => subscription.user_id as string),
  );

  const { data: trialProfiles, error: trialProfilesError } = await supabase
    .from("profiles")
    .select("id")
    .in("id", optedInIds)
    .gte("trial_ends_at", new Date().toISOString());
  if (trialProfilesError) throw new Error(`试用状态读取失败：${trialProfilesError.message}`);
  const trialIds = new Set((trialProfiles ?? []).map((profile) => profile.id as string));

  const eligible = enabled.filter((preference) => {
    const ownerId = ownerByMember.get(preference.user_id);
    return (
      subscriberIds.has(preference.user_id) ||
      trialIds.has(preference.user_id) ||
      (ownerId !== undefined && enterpriseOwnerIds.has(ownerId))
    );
  });
  if (eligible.length === 0) return [];

  const usersById = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const user of data.users) {
      if (user.email) usersById.set(user.id, user.email);
    }
    if (data.users.length < 1000) break;
  }

  return eligible.flatMap((preference) => {
    const email = usersById.get(preference.user_id);
    return email ? [{ ...preference, email }] : [];
  });
}
