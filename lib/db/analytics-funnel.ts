import "server-only";
import { isAdminEmail } from "@/lib/admin-auth";
import { isReservedEmailDomain } from "@/lib/notifications/reserved-domains";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { buildAcquisitionFunnel, type AcquisitionFunnel, type FunnelPageView, type FunnelSignup } from "@/lib/analytics-funnel";

const PAGE_SIZE = 1000;
/** Far above today's traffic; past it the section says the period was cut short. */
const MAX_PAGE_VIEWS = 50_000;

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/**
 * External page views only, and only those that carry a country: production
 * requests always do (Vercel sets the geo header), and the rows that don't
 * are local `next dev` checks from before 2026-09-25, when they were still
 * being filed as external. Counting them would put our own screenshots into
 * the funnel.
 */
async function readExternalPageViews(supabase: AdminClient, since: string): Promise<{ rows: FunnelPageView[]; truncated: boolean }> {
  const rows: FunnelPageView[] = [];
  for (let from = 0; from < MAX_PAGE_VIEWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("session_id,user_id,path,properties,created_at")
      .eq("event_type", "page_view")
      .eq("is_internal", false)
      .not("country_code", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as FunnelPageView[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export type AccountRow = { id: string; email: string | null; createdAt: string };

export async function readAccounts(supabase: AdminClient): Promise<AccountRow[]> {
  const accounts: AccountRow[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw error;
    const users = data?.users ?? [];
    accounts.push(...users.map((user) => ({ id: user.id, email: user.email ?? null, createdAt: user.created_at })));
    if (users.length < PAGE_SIZE) return accounts;
  }
}

/**
 * Accounts that are ours: an admin address, a reserved test domain, or any
 * account that has ever browsed from a device marked internal. The last rule
 * is what catches the owner's own test sign-ups (2026-09-26: 当前还没有注册
 * 用户，都是我自己) — they use ordinary addresses, but every one of them was
 * opened and used on the owner's own devices. Only accounts that matter to
 * this period are checked, one count query each, ten at a time.
 *
 * Also every profile marked exclude_from_stats (migration 0063), the same
 * flag the counters above the funnel honour. Without it two internal sign-ups
 * opened in WeChat still showed as 微信 → 注册 2 (user, 2026-10-06: 2个微信注册
 * 数据，也是属于内部的请先调整成0). Before 0063 has run the column is missing
 * (42703) and only the rules above apply.
 */
async function excludedFromStats(supabase: AdminClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("profiles").select("id").eq("exclude_from_stats", true);
  if (error?.code === "42703") return new Set();
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

export async function ownAccountIds(supabase: AdminClient, candidates: AccountRow[]): Promise<Set<string>> {
  const own = new Set<string>();
  const unknown: string[] = [];
  const excluded = await excludedFromStats(supabase);
  for (const account of candidates) {
    if (excluded.has(account.id) || isAdminEmail(account.email) || isReservedEmailDomain(account.email)) own.add(account.id);
    else unknown.push(account.id);
  }
  for (let index = 0; index < unknown.length; index += 10) {
    await Promise.all(unknown.slice(index, index + 10).map(async (userId) => {
      const { count, error } = await supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_internal", true);
      if (error) throw error;
      if ((count ?? 0) > 0) own.add(userId);
    }));
  }
  return own;
}

export async function fetchAcquisitionFunnel(days: number): Promise<AcquisitionFunnel | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sinceMs = new Date(since).getTime();
  const [{ rows, truncated }, accounts] = await Promise.all([readExternalPageViews(supabase, since), readAccounts(supabase)]);
  const signups: FunnelSignup[] = accounts
    .filter((account) => new Date(account.createdAt).getTime() >= sinceMs)
    .map((account) => ({ userId: account.id, createdAt: account.createdAt }));
  // Accounts that opened in the period or were signed in on an outside page view.
  const relevant = new Set([...signups.map((signup) => signup.userId), ...rows.flatMap((row) => (row.user_id ? [row.user_id] : []))]);
  const own = await ownAccountIds(supabase, accounts.filter((account) => relevant.has(account.id)));
  return { ...buildAcquisitionFunnel(rows, signups, own), truncated };
}
