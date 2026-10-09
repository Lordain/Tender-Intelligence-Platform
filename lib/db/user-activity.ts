import "server-only";
import { buildUserActivity, type ActivityEvent, type UserActivityRow } from "@/lib/user-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ownAccountIds, readAccounts } from "@/lib/db/analytics-funnel";

const PAGE_SIZE = 1000;
const ID_CHUNK = 100;
/** Far above two or two hundred accounts; past it the table says it was cut short. */
const MAX_EVENTS = 50_000;

export type UserActivity = { rows: UserActivityRow[]; truncated: boolean };

/**
 * Read-only. One row per registered account that is not ours (the same rule
 * as the funnel and the 已注册用户 counter: admin addresses, test domains,
 * exclude_from_stats profiles and accounts used on an internal device are
 * left out). Never written to a public page — see lib/user-activity.ts.
 */
export async function fetchUserActivity(now = new Date()): Promise<UserActivity | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const all = await readAccounts(supabase);
  const own = await ownAccountIds(supabase, all);
  const accounts = all.filter((account) => !own.has(account.id));
  if (accounts.length === 0) return { rows: [], truncated: false };

  const { data: preferences, error: preferenceError } = await supabase
    .from("email_notification_preferences")
    .select("user_id, enabled")
    .in("user_id", accounts.map((account) => account.id));
  if (preferenceError) throw preferenceError;
  const enabled = new Set(((preferences ?? []) as Array<{ user_id: string; enabled: boolean }>).filter((row) => row.enabled).map((row) => row.user_id));

  const events: ActivityEvent[] = [];
  let truncated = false;
  for (let index = 0; index < accounts.length && !truncated; index += ID_CHUNK) {
    const ids = accounts.slice(index, index + ID_CHUNK).map((account) => account.id);
    for (let from = 0; ; from += PAGE_SIZE) {
      if (events.length >= MAX_EVENTS) {
        truncated = true;
        break;
      }
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_type, user_id, tender_id, properties, created_at")
        .in("user_id", ids)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as ActivityEvent[];
      events.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  const rows = buildUserActivity(
    accounts.map((account) => ({ id: account.id, email: account.email, createdAt: account.createdAt, emailNotifications: enabled.has(account.id) })),
    events,
    now,
  );
  return { rows, truncated };
}
