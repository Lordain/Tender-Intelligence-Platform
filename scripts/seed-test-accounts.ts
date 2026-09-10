/**
 * Creates one signed-in test account per entitlement level so the access
 * model can actually be exercised end to end: 试用 / 免费 / 个人版 / 企业版主
 * 账号 / 企业成员 / 待处理邀请. (访客 needs no account — sign out.)
 *
 * Idempotent: re-running reuses accounts that already exist and resets them
 * to the state described below, so it is safe to run after a schema change
 * or once a trial has aged out. `--cleanup` deletes every account it makes.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and migrations through 0027.
 * Accounts are created with
 * email_confirm: true, so no confirmation mail is sent and they can sign in
 * immediately. Never point this at a database with real users — it deletes
 * by address and rewrites subscriptions.
 *
 * Usage:
 *   npm run seed:test-accounts
 *   npm run seed:test-accounts -- --only-free
 *   npm run seed:test-accounts -- --password='YourPass123!' --domain=example.com
 *   npm run seed:test-accounts -- --cleanup
 */
// Relative, not the "@/" alias: every other scripts/*.ts does the same,
// because these run under tsx rather than through the Next.js bundler.
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { assertWritten } from "../lib/db/assert-written";

type Role = "trial" | "free" | "professional" | "enterprise-owner" | "enterprise-member" | "invitee";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) =>
  args.find((argument) => argument.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const CLEANUP = args.includes("--cleanup");
const ONLY_FREE = args.includes("--only-free");
const DOMAIN = flag("domain", "example.com");
const PASSWORD = flag("password", "TenderTest123!");
const COMPANY = "测试企业（Seeded）";

const DAY = 86_400_000;
const ACCOUNTS: { role: Role; local: string; describe: string }[] = [
  { role: "trial", local: "qa-trial", describe: "试用中 · 剩余 2 天 · 可看详情、可收邮件" },
  { role: "free", local: "qa-free", describe: "试用已过期 · 项目列表只读 · 所有操作提示订阅 · 不收邮件" },
  { role: "professional", local: "qa-pro", describe: "个人版订阅（按月）· 全部权限 · 可测取消续期" },
  { role: "enterprise-owner", local: "qa-ent-owner", describe: "企业版主账号（年度）· 可在账户管理邀请成员" },
  { role: "enterprise-member", local: "qa-ent-member", describe: "企业成员 · 已接受邀请 · 全部权限" },
  { role: "invitee", local: "qa-ent-invitee", describe: "收到待处理邀请 · 用于测试接受/拒绝" },
];
const TARGET_ACCOUNTS = ONLY_FREE ? ACCOUNTS.filter((account) => account.role === "free") : ACCOUNTS;

const emailFor = (local: string) => `${local}@${DOMAIN}`;

const supabase = createSupabaseAdminClient();
if (!supabase) {
  console.error("SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set. Nothing was written.");
  process.exit(1);
}
const admin = supabase;

/** listUsers has no email filter, so finding one means walking the pages. */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const wanted = email.toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers 失败：${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
}

async function ensureUser(email: string): Promise<string> {
  const existing = await findUserIdByEmail(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing, { password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`${email} 密码重置失败：${error.message}`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`${email} 创建失败：${error?.message ?? "no user returned"}`);
  return data.user.id;
}

async function cleanup() {
  for (const account of TARGET_ACCOUNTS) {
    const email = emailFor(account.local);
    const id = await findUserIdByEmail(email);
    if (!id) {
      console.log(`skip    ${email} (不存在)`);
      continue;
    }
    // profiles / subscriptions / enterprise_members all cascade from auth.users.
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`${email} 删除失败：${error.message}`);
    console.log(`deleted ${email}`);
  }
}

async function seed() {
  const idByRole = new Map<Role, string>();
  for (const account of TARGET_ACCOUNTS) {
    idByRole.set(account.role, await ensureUser(emailFor(account.local)));
  }

  // Wipe this seed's own rows first so a re-run is a reset, not an append.
  const ids = [...idByRole.values()];
  assertWritten("测试订阅清理", await admin.from("subscriptions").delete().in("user_id", ids));
  assertWritten("测试企业成员清理", await admin.from("enterprise_members").delete().in("owner_user_id", ids));
  assertWritten("测试企业成员清理（受邀方）", await admin.from("enterprise_members").delete().in("member_user_id", ids));

  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();

  // profiles rows already exist (handle_new_user runs on signup); only the
  // trial clock and the company name need setting. Subscribers get an EXPIRED
  // trial on purpose, so a subscriber role can only be coming from the
  // subscription — that is the thing under test.
  const trialEnds: Record<Role, string> = {
    trial: iso(2),
    free: iso(-1),
    professional: iso(-1),
    "enterprise-owner": iso(-1),
    "enterprise-member": iso(-1),
    invitee: iso(-1),
  };
  for (const [role, id] of idByRole) {
    assertWritten(
      `profiles(${role})`,
      await admin.from("profiles").update({
        trial_ends_at: trialEnds[role],
        company_name: role === "enterprise-owner" ? COMPANY : null,
      }).eq("id", id),
    );
  }

  // The common UI check only needs the lapsed account. Keep this targeted
  // mode from creating or resetting the other five QA identities in a live
  // project merely to exercise one paywall state.
  if (ONLY_FREE) {
    const freeId = idByRole.get("free")!;
    assertWritten("通知偏好(free)", await admin.from("email_notification_preferences").upsert({
      user_id: freeId,
      enabled: true,
      countries: [],
      industries: [],
      statuses: [],
      relevance_tiers: [],
      keywords: [],
      timezone: "America/Mexico_City",
      updated_at: new Date(now).toISOString(),
    }));
    console.log(`\n密码：${PASSWORD}\n`);
    console.log(`${emailFor("qa-free").padEnd(34)} ${TARGET_ACCOUNTS[0].describe}`);
    return;
  }

  // A window that is already underway, so 账户管理 shows a real start AND end
  // date and the 取消自动续费 flow has a meaningful "access continues until"
  // to state. cancel_at_period_end is left at its default; re-running the
  // seeder deletes and reinserts these rows, which is how a cancellation test
  // gets reset.
  //
  // Each window is as long as the interval it claims — 30 days for monthly,
  // 365 for annual — and already underway, so the dates on 账户管理 and in
  // list:subscriptions agree with the 计费周期 next to them.
  //
  // The stripe_subscription_id values are obviously fake and belong to no
  // real Stripe account. They are here because the account page treats a row
  // with no billing link as "ends on this date, nothing will renew it" and
  // hides the cancel action — correctly, but that would leave the cancel
  // flow untestable. The two plans also use different intervals so the
  // 计费周期 row and list:subscriptions have something to distinguish.
  assertWritten("个人版订阅", await admin.from("subscriptions").insert({
    user_id: idByRole.get("professional"), plan: "professional", status: "active",
    billing_interval: "monthly", stripe_subscription_id: "sub_seed_professional",
    current_period_start: iso(-10), current_period_end: iso(20),
  }));
  assertWritten("企业版订阅", await admin.from("subscriptions").insert({
    user_id: idByRole.get("enterprise-owner"), plan: "enterprise", status: "active",
    billing_interval: "annual", stripe_subscription_id: "sub_seed_enterprise",
    current_period_start: iso(-30), current_period_end: iso(335),
  }));

  // One seat already accepted, one invitation still waiting — the second is
  // what the 接受/拒绝 card on /account is for.
  assertWritten("企业成员（已接受）", await admin.from("enterprise_members").insert({
    owner_user_id: idByRole.get("enterprise-owner"),
    member_user_id: idByRole.get("enterprise-member"),
    email: emailFor("qa-ent-member"),
    status: "accepted",
    responded_at: new Date(now).toISOString(),
  }));
  assertWritten("企业邀请（待处理）", await admin.from("enterprise_members").insert({
    owner_user_id: idByRole.get("enterprise-owner"),
    member_user_id: idByRole.get("invitee"),
    email: emailFor("qa-ent-invitee"),
    status: "pending",
  }));

  // Notification opt-ins for everyone, so the digest's recipient rules are
  // testable: 试用 / 个人版 / 企业主账号 / 企业成员 should be picked up and
  // 免费版 should not, even though it asked for mail.
  for (const [role, id] of idByRole) {
    assertWritten(`通知偏好(${role})`, await admin.from("email_notification_preferences").upsert({
      user_id: id,
      enabled: true,
      countries: [],
      industries: [],
      statuses: [],
      relevance_tiers: [],
      keywords: [],
      timezone: "America/Mexico_City",
      updated_at: new Date(now).toISOString(),
    }));
  }

  console.log(`\n密码（全部账号相同）：${PASSWORD}\n`);
  for (const account of TARGET_ACCOUNTS) {
    console.log(`${emailFor(account.local).padEnd(34)} ${account.describe}`);
  }
  console.log(`\n访客：直接退出登录访问，无需账号。`);
  console.log(`企业版共 3 个账号：qa-ent-owner（主）+ qa-ent-member（已接受）+ qa-ent-invitee（待接受）。`);
  console.log(`预期：登录 qa-ent-invitee → /account 出现「企业版邀请」卡片，接受后升级为完整权限。`);
}

(CLEANUP ? cleanup() : seed())
  .then(() => console.log(CLEANUP ? "\n测试账号已删除。" : "\n完成。"))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
