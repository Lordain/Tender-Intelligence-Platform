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
import { digestCadence, type DigestCadence } from "./digest-cadence";

type Preference = {
  user_id: string;
  enabled: boolean;
  countries: string[];
  industries: string[];
  statuses: string[];
  relevance_tiers: string[];
  keywords: string[];
};


const PAGE_SIZE = 1000;
/** UUIDs per `.in()` filter: ~37 characters each keeps the request URL well under gateway limits. */
const IN_CHUNK = 150;

/** Run one `.in()` read per chunk of ids and concatenate, throwing on the first error. */
async function readInChunks<T = Record<string, unknown>>(
  ids: string[],
  label: string,
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += IN_CHUNK) {
    const { data, error } = await read(ids.slice(start, start + IN_CHUNK));
    if (error) throw new Error(`${label}读取失败：${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

export type DigestRecipient = Preference & {
  email: string;
  cadence: DigestCadence;
};

/**
 * Who gets the twice-daily mail: current subscribers, users still inside the
 * three-day trial, and the seat holders on a current enterprise subscription
 * — intersected with the people who actually turned notifications on.
 *
 * The order matters. Eligibility used to be computed first, which meant
 * `profiles.select("id").gte("trial_ends_at", now)` — an unfiltered read of
 * every profile on the platform. PostgREST caps a select at 1000 rows by
 * default and returns the first page without an error, so once the table
 * passed 1000 rows the trial users beyond the cap would have silently
 * dropped off the send list with nothing in the logs. Starting from the
 * opt-ins instead bounds every query below by the (much smaller) set of
 * people who asked for mail at all.
 *
 * Every read below is complete or throws (2026-09-26). The opt-in list is
 * paged, and the `.in()` lookups keyed on it are chunked, because a thousand
 * UUIDs in one PostgREST URL is past what the gateway accepts. The auth user
 * listing used to `break` on an error, which dropped everyone on the
 * remaining pages from the send without a word; it throws now, like the rest.
 */
export async function getDigestRecipients(): Promise<DigestRecipient[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the recipient list cannot be built");

  // A swallowed error here is indistinguishable from "nobody opted in", and
  // the caller would report a successful digest run having mailed no one.
  const enabled: Preference[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("email_notification_preferences")
      .select("user_id, enabled, countries, industries, statuses, relevance_tiers, keywords")
      .eq("enabled", true)
      .order("user_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`通知偏好读取失败：${error.message}`);
    enabled.push(...((data ?? []) as Preference[]));
    if ((data ?? []).length < PAGE_SIZE) break;
  }

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
  const memberships = await readInChunks(optedInIds, "企业成员", (ids) => supabase
    .from("enterprise_members")
    .select("member_user_id, owner_user_id")
    .eq("status", "accepted")
    .in("member_user_id", ids));
  const ownerByMember = new Map(
    memberships.map((row) => [row.member_user_id as string, row.owner_user_id as string]),
  );

  // Chunked by user, so all of one user's rows land in the same chunk and the
  // newest-first order selectPreferredSubscription relies on holds per user.
  const subscriptions = await readInChunks([...new Set([...optedInIds, ...ownerByMember.values()])], "订阅", (ids) => supabase
    .from("subscriptions")
    .select("id, user_id, plan, status, created_at, current_period_start, current_period_end")
    .in("user_id", ids)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false }));
  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const userSubscriptions = subscriptionsByUser.get(subscription.user_id) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.user_id, userSubscriptions);
  }
  const current = [...subscriptionsByUser.values()].flatMap((userSubscriptions) => {
    const selected = selectPreferredSubscription(userSubscriptions);
    return selected ? [selected] : [];
  });
  const enterpriseOwnerIds = new Set(
    current.filter((subscription) => subscription.plan === "enterprise").map((subscription) => subscription.user_id as string),
  );
  const basicSubscriptions = current.filter((subscription) => subscription.plan === "basic");
  const basicCountries = await readInChunks(basicSubscriptions.map((subscription) => subscription.id as string), "基础版国家", (ids) => supabase
    .from("basic_plan_countries").select("subscription_id, country").in("subscription_id", ids));
  const countryBySubscription = new Map(basicCountries.map((row) => [row.subscription_id, row.country]));
  const subscriptionByUser = new Map(current.map((subscription) => [subscription.user_id, subscription]));

  const trialNow = new Date().toISOString();
  const trialProfiles = await readInChunks(optedInIds, "试用状态", (ids) => supabase
    .from("profiles")
    .select("id")
    .in("id", ids)
    .gte("trial_ends_at", trialNow));
  const trialIds = new Set(trialProfiles.map((profile) => profile.id as string));

  const eligible = enabled;
  if (eligible.length === 0) return [];

  const usersById = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`用户邮箱读取失败（第 ${page} 页）：${error.message}`);
    for (const user of data.users) {
      if (user.email) usersById.set(user.id, user.email);
    }
    if (data.users.length < 1000) break;
  }

  return eligible.flatMap<DigestRecipient>((preference) => {
    const email = usersById.get(preference.user_id);
    if (!email) return [];
    const ownerId = ownerByMember.get(preference.user_id);
    const subscription = subscriptionByUser.get(preference.user_id);
    const isEnterpriseMember = ownerId !== undefined && enterpriseOwnerIds.has(ownerId);
    const cadence = digestCadence(subscription?.plan ?? null, isEnterpriseMember, trialIds.has(preference.user_id));
    if (subscription?.plan === "basic") {
      const country = countryBySubscription.get(subscription.id);
      if (!country) return [];
      return [{ ...preference, countries: [country], keywords: [], email, cadence }];
    }
    return [{ ...preference, keywords: cadence === "weekly" ? [] : preference.keywords, email, cadence }];
  });
}
