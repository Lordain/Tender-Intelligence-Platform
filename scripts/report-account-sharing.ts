/**
 * How many browsers each account is signed in from — the number the device
 * cap was set without.
 *
 * MAX_ACTIVE_DEVICES ships at 3, chosen with nothing behind it: every
 * account in analytics on 2026-09-13 was one of our own QA logins. This is
 * the instrument for revising it once real accounts have history.
 *
 * Read `concurrent` before `browsers`. A browser id lives in localStorage,
 * so clearing site data or using a private window mints a new one — one
 * person who does either looks like several over a month. Colleagues
 * sharing a login are the ones who show up in the SAME HOUR.
 *
 * Usage: npm run report:account-sharing
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { MAX_ACTIVE_DEVICES } from "../lib/account-devices";

type Row = { user_id: string | null; session_id: string; created_at: string };

async function main() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("需要 SUPABASE_SERVICE_ROLE_KEY。");
    process.exit(1);
  }

  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("analytics_events")
      .select("user_id, session_id, created_at")
      .not("user_id", "is", null).gte("created_at", since)
      .range(from, from + 999);
    if (error) {
      console.error("读取 analytics_events 失败：", error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailOf = new Map((users?.users ?? []).map((user) => [user.id, user.email ?? user.id]));

  const perUser = new Map<string, { browsers: Set<string>; hours: Map<string, Set<string>> }>();
  for (const row of rows) {
    if (!row.user_id) continue;
    let entry = perUser.get(row.user_id);
    if (!entry) perUser.set(row.user_id, (entry = { browsers: new Set(), hours: new Map() }));
    entry.browsers.add(row.session_id);
    const hour = row.created_at.slice(0, 13);
    const bucket = entry.hours.get(hour) ?? new Set<string>();
    bucket.add(row.session_id);
    entry.hours.set(hour, bucket);
  }

  const report = [...perUser.entries()]
    .map(([userId, entry]) => ({
      email: emailOf.get(userId) ?? userId,
      browsers: entry.browsers.size,
      concurrent: Math.max(0, ...[...entry.hours.values()].map((set) => set.size)),
    }))
    .sort((a, b) => b.concurrent - a.concurrent || b.browsers - a.browsers);

  if (report.length === 0) {
    console.log("过去 90 天没有已登录用户的访问记录。");
    return;
  }

  console.log(`过去 90 天，${report.length} 个账号。当前上限 ${MAX_ACTIVE_DEVICES} 台。\n`);
  console.log("同小时并发  浏览器数  账号");
  for (const line of report) {
    const flag = line.concurrent > MAX_ACTIVE_DEVICES ? "  ← 超出上限" : "";
    console.log(`${String(line.concurrent).padStart(8)}  ${String(line.browsers).padStart(8)}  ${line.email}${flag}`);
  }

  const over = report.filter((line) => line.concurrent > MAX_ACTIVE_DEVICES).length;
  console.log(`\n${over} 个账号的同小时并发超过 ${MAX_ACTIVE_DEVICES}。`);
  console.log("单人基线通常是 1；并发常年 4 以上的，基本可以确认是多人共用。");
}

main();
