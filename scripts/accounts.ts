/**
 * Lists every registered account, and deletes the ones named on the command
 * line. Read-only unless --delete is given AND --write is given.
 *
 * Why this exists: until now the only way to see who has an account was
 * list:subscriptions, which shows only accounts that HAVE a subscription —
 * so a database full of accounts created while testing (registrations from
 * the author's own browsers, seeded QA accounts, abandoned signups) was
 * invisible. The user asked to clean those up on 2026-09-14, and the first
 * requirement of deleting accounts is being able to see them.
 *
 * Deleting an auth user is enough: profiles, subscriptions, account_devices,
 * billing_profiles, email_notification_preferences, tender_digest_deliveries,
 * enterprise_members, manual_payment_requests and
 * subscription_renewal_reminders all declare `on delete cascade` from
 * auth.users. Two tables deliberately do NOT cascade — analytics_events and
 * billing_admin_audit_log use `on delete set null`, so the traffic history
 * and the audit trail survive the account. Clear analytics separately with
 * purge:analytics.
 *
 * REFUSES to delete an address in ADMIN_EMAILS. Locking yourself out of
 * /admin by deleting your own account is a one-keystroke mistake with no
 * undo, and no legitimate cleanup needs it — remove the address from
 * ADMIN_EMAILS first if you really mean it.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 *
 * Usage:
 *   npm run accounts                                          (list everything)
 *   npm run accounts -- --delete=a@b.com,c@d.com              (dry run — shows what would go)
 *   npm run accounts -- --delete=a@b.com,c@d.com --write      (actually deletes)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? "";
const WRITE = hasWriteFlag();
const DELETE_LIST = flag("delete")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const PAGE_SIZE = 1000;
const DAY = 86_400_000;

type Account = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
};

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "—");

/** Days since a timestamp, or null when it never happened. */
function daysAgo(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / DAY);
}

async function listAllUsers(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>): Promise<Account[]> {
  const accounts: Account[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`listUsers 失败：${error.message}`);
    for (const user of data.users) {
      accounts.push({
        id: user.id,
        email: user.email ?? "(无邮箱)",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < PAGE_SIZE) break;
  }
  return accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function main() {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY（以及 NEXT_PUBLIC_SUPABASE_URL）必须设置。");

  const accounts = await listAllUsers(admin);
  if (accounts.length === 0) {
    console.log("数据库里没有任何账号。");
    return;
  }

  const ids = accounts.map((account) => account.id);
  const [profiles, subscriptions, devices, members] = await Promise.all([
    admin.from("profiles").select("id, company_name, trial_ends_at").in("id", ids),
    admin.from("subscriptions").select("user_id, plan, status, current_period_end").in("user_id", ids),
    admin.from("account_devices").select("user_id, revoked_at").in("user_id", ids),
    admin.from("enterprise_members").select("owner_user_id, member_user_id, email").in("owner_user_id", ids),
  ]);
  for (const [label, result] of [
    ["profiles", profiles],
    ["subscriptions", subscriptions],
    ["account_devices", devices],
    ["enterprise_members", members],
  ] as const) {
    if (result.error) throw new Error(`${label} 读取失败：${result.error.message}`);
  }

  const profileById = new Map((profiles.data ?? []).map((row) => [row.id as string, row]));
  const subscriptionByUser = new Map((subscriptions.data ?? []).map((row) => [row.user_id as string, row]));
  const activeDeviceCount = new Map<string, number>();
  for (const row of devices.data ?? []) {
    if (row.revoked_at) continue;
    const key = row.user_id as string;
    activeDeviceCount.set(key, (activeDeviceCount.get(key) ?? 0) + 1);
  }
  const seatCount = new Map<string, number>();
  const memberOf = new Set<string>();
  for (const row of members.data ?? []) {
    const owner = row.owner_user_id as string;
    seatCount.set(owner, (seatCount.get(owner) ?? 0) + 1);
    if (row.member_user_id) memberOf.add(row.member_user_id as string);
  }
  // Counted one account at a time with a head request. A single
  // .in("user_id", ids) select would be capped at 1000 rows by PostgREST
  // WITHOUT SAYING SO, and analytics_events is the one table here that
  // routinely holds more than that — the count would silently read as a
  // few hundred per account no matter how much traffic there had been.
  const eventCount = new Map<string, number>();
  for (const account of accounts) {
    const { count, error } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", account.id);
    if (error) throw new Error(`analytics_events 读取失败：${error.message}`);
    eventCount.set(account.id, count ?? 0);
  }

  const admins = adminEmails();
  if (admins.size === 0) {
    console.log("⚠ ADMIN_EMAILS 是空的 —— 本次运行无法判断哪些账号是管理员，删除保护失效。请先设置再删除账号。\n");
  }

  console.log(`共 ${accounts.length} 个账号：\n`);
  console.log("注册日期    最后登录     套餐              设备  统计事件  角色      邮箱");
  for (const account of accounts) {
    const profile = profileById.get(account.id);
    const subscription = subscriptionByUser.get(account.id);
    const trialDays = profile?.trial_ends_at ? Math.ceil((new Date(profile.trial_ends_at as string).getTime() - Date.now()) / DAY) : null;
    const plan = subscription
      ? `${subscription.plan}/${subscription.status}`.padEnd(17)
      : (trialDays !== null && trialDays > 0 ? `试用中(剩${trialDays}天)` : "无订阅").padEnd(17);
    const since = daysAgo(account.lastSignInAt);
    const lastSeen = account.lastSignInAt ? `${day(account.lastSignInAt)}` : "从未登录  ";
    const roles: string[] = [];
    if (admins.has(account.email.toLowerCase())) roles.push("管理员");
    if (seatCount.has(account.id)) roles.push(`企业主(${seatCount.get(account.id)}席)`);
    if (memberOf.has(account.id)) roles.push("企业成员");
    console.log(
      [
        day(account.createdAt),
        lastSeen.padEnd(12),
        plan,
        String(activeDeviceCount.get(account.id) ?? 0).padStart(4),
        String(eventCount.get(account.id) ?? 0).padStart(9),
        (roles.join("+") || "—").padEnd(9),
        account.email,
        since !== null && since > 30 ? `  ← ${since} 天没登录` : "",
      ].join("  "),
    );
  }

  if (DELETE_LIST.length === 0) {
    console.log("\n只读运行。要删除账号：npm run accounts -- --delete=邮箱1,邮箱2 [--write]");
    return;
  }

  console.log("");
  const byEmail = new Map(accounts.map((account) => [account.email.toLowerCase(), account]));
  const targets: Account[] = [];
  for (const email of DELETE_LIST) {
    const account = byEmail.get(email);
    if (!account) {
      console.log(`跳过    ${email}（数据库里没有这个账号）`);
      continue;
    }
    if (admins.has(email)) {
      console.log(`拒绝    ${email}（这是 ADMIN_EMAILS 里的管理员账号；要删请先把地址从 ADMIN_EMAILS 移除）`);
      continue;
    }
    targets.push(account);
  }

  if (targets.length === 0) {
    console.log("没有可删除的账号。");
    return;
  }

  for (const account of targets) {
    const label = `${account.email}（注册于 ${day(account.createdAt)}，${eventCount.get(account.id) ?? 0} 条统计事件）`;
    if (!WRITE) {
      console.log(`将删除  ${label}`);
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(account.id);
    if (error) throw new Error(`${account.email} 删除失败：${error.message}`);
    console.log(`已删除  ${label}`);
  }

  console.log(
    WRITE
      ? `\n完成：删除了 ${targets.length} 个账号。相关的订阅、设备、通知设置、企业席位都已级联删除；统计事件保留但已不再关联账号。`
      : `\n以上是试运行，什么都没删。确认无误后加 --write 真正执行。`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
