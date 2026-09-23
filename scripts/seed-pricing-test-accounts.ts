/**
 * Isolated QA identities for the four-tier pricing launch.
 *
 * Dry-run by default. Creation requires --apply, an explicit environment
 * confirmation flag and an exact --project-url matching NEXT_PUBLIC_SUPABASE_URL.
 * Existing addresses are never changed:
 * if one exists, the script stops before making any writes. A disposable
 * Supabase project is preferred; production requires explicit confirmation.
 * These identities are not billing customers and their paid access lasts 7 days.
 *
 * Example:
 *   npm run seed:pricing-test-accounts -- --domain=example.com
 *   npm run seed:pricing-test-accounts -- --apply --confirm-nonproduction --project-url=https://TEST-PROJECT.supabase.co --domain=example.com
 *   npm run seed:pricing-test-accounts -- --apply --confirm-production --project-url=https://PROJECT.supabase.co --domain=example.com
 */
import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type TestRole = "trial" | "free" | "basic" | "professional" | "enterprise-owner" | "enterprise-member" | "pending-invitee";

const args = process.argv.slice(2);
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = args.includes("--apply");
const domain = option("domain") ?? "example.com";
const projectUrl = option("project-url");
const password = option("password") ?? `Qa-${randomBytes(18).toString("base64url")}!`;
const roles: TestRole[] = ["trial", "free", "basic", "professional", "enterprise-owner", "enterprise-member", "pending-invitee"];
const addresses = Object.fromEntries(roles.map((role) => [role, `qa-pricing-${role}@${domain}`])) as Record<TestRole, string>;

function check<T>({ data, error }: { data: T; error: { message: string } | null }, label: string): T {
  if (error) throw new Error(`${label}：${error.message}`);
  return data;
}

async function main() {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("--domain 不是有效域名。");
  if (password.length < 12) throw new Error("测试密码至少需要 12 个字符。");
  console.log(`测试账号：\n${roles.map((role) => `  ${role.padEnd(20)} ${addresses[role]}`).join("\n")}`);
  if (!apply) {
    console.log("\n预览模式：没有连接数据库，也没有创建账号。使用 --apply、环境确认标志和 --project-url 明确指定目标。");
    return;
  }
  const confirmedNonproduction = args.includes("--confirm-nonproduction");
  const confirmedProduction = args.includes("--confirm-production");
  if (confirmedNonproduction === confirmedProduction) throw new Error("请明确且仅选择 --confirm-nonproduction 或 --confirm-production；没有执行写入。");
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!configuredUrl || projectUrl?.replace(/\/$/, "") !== configuredUrl) {
    throw new Error("--project-url 必须与 NEXT_PUBLIC_SUPABASE_URL 完全一致；没有执行写入。");
  }
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY；没有执行写入。");

  // Preflight the schema and every email before creating any user. No existing
  // identity is reset or adopted, even if it has a familiar QA-looking name.
  check(await admin.from("basic_plan_countries").select("subscription_id").limit(1), "缺少定价迁移 0055");
  for (let page = 1; ; page += 1) {
    const { data: result, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`检查现有账号：${error.message}`);
    const existing = result.users.find((user) => user.email && roles.some((role) => user.email?.toLowerCase() === addresses[role].toLowerCase()));
    if (existing) throw new Error(`${existing.email} 已存在；为保护现有数据，未创建或重置任何账号。`);
    if (result.users.length < 1000) break;
  }

  const ids = {} as Record<TestRole, string>;
  for (const role of roles) {
    const { data: result, error } = await admin.auth.admin.createUser({ email: addresses[role], password, email_confirm: true });
    if (error) throw new Error(`创建 ${role}：${error.message}`);
    if (!result.user) throw new Error(`${role} 创建后没有返回用户 ID。`);
    ids[role] = result.user.id;
  }

  const now = Date.now();
  const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();
  for (const role of roles) {
    check(await admin.from("profiles").upsert({ id: ids[role], trial_ends_at: role === "trial" ? iso(2) : iso(-2) }, { onConflict: "id" }), `设置 ${role} 试用状态`);
  }
  const client = admin;
  async function subscription(role: "basic" | "professional" | "enterprise-owner", plan: "basic" | "professional" | "enterprise") {
    const result = check(await client.from("subscriptions").insert({
      user_id: ids[role], plan, status: "active", payment_source: "manual",
      billing_interval: "monthly", current_period_start: iso(-3), current_period_end: iso(7),
    }).select("id").single(), `设置 ${role} 订阅`);
    if (!result) throw new Error(`设置 ${role} 订阅后没有返回记录。`);
    return result.id as string;
  }
  const basicSubscriptionId = await subscription("basic", "basic");
  await subscription("professional", "professional");
  await subscription("enterprise-owner", "enterprise");
  check(await admin.from("basic_plan_countries").insert({ subscription_id: basicSubscriptionId, country: "Mexico" }), "设置基础版国家");
  check(await admin.from("enterprise_members").insert({ owner_user_id: ids["enterprise-owner"], member_user_id: ids["enterprise-member"], email: addresses["enterprise-member"], status: "accepted", responded_at: new Date(now).toISOString() }), "设置企业成员");
  check(await admin.from("enterprise_members").insert({ owner_user_id: ids["enterprise-owner"], member_user_id: ids["pending-invitee"], email: addresses["pending-invitee"], status: "pending" }), "设置待接受邀请");
  console.log(`\n已创建 ${roles.length} 个测试账号。统一密码：${password}`);
  console.log("试用：可查看全部详情；免费：每月 5 个完整详情；基础版：仅墨西哥完整详情；专业版：全国家详情和导出；企业主/成员：全功能；待邀请：接受邀请前为免费版。");
  console.log("测试完成后，请在 Supabase Auth 中移除这些 qa-pricing-* 账号；不要在正式客户库运行本脚本。");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
