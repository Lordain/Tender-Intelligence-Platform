/**
 * Reconciles ONE account against what a Stripe payment was supposed to do.
 *
 * Written for the gap that code review cannot close: a live payment can
 * succeed in Stripe and still leave the person with nothing, because the
 * webhook sits between the two and is the one link never exercised. Money
 * moving is not entitlement; this prints the entitlement.
 *
 * Every rule below is IMPORTED from lib/access-control.ts — the same
 * functions the site itself calls. A reconciliation script that re-implements
 * the rules can pass while the site refuses the customer, which is the one
 * failure it exists to catch.
 *
 * The one thing it does have to restate is the QUERY: getViewerEntitlement()
 * is `server-only` and reads the caller's session, so a CLI cannot call it.
 * The subscription lookup here mirrors findCurrentSubscription() in
 * lib/access-control-server.ts — same status filter, same ordering, same
 * selectPreferredSubscription(). If that function's query changes and this
 * one does not, this script will confidently report the wrong answer, so
 * they are cross-checked in the header of each: change one, change both.
 *
 * READ-ONLY. It never writes, never claims a free view (that would spend one
 * of the five it is reporting on), and never touches Stripe.
 *
 * Usage:
 *   npm run check:subscription-state -- --email qa-pro@example.com
 *   npm run check:subscription-state -- --user 00000000-0000-0000-0000-000000000000
 */
import {
  canExportTenders,
  canViewCountry,
  isSubscriptionEntitled,
  selectPreferredSubscription,
  TRIAL_DAYS,
  type SubscriptionPlan,
  type ViewerEntitlement,
} from "../lib/access-control";
import { digestCadence } from "../lib/notifications/digest-cadence";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

/** Mirrors the columns findCurrentSubscription() selects, plus payment_source for the report. */
type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  created_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  billing_interval: string | null;
  stripe_subscription_id: string | null;
  payment_source: string | null;
};

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const CADENCE_LABEL = { weekly: "每周 1 次（周一早班）", daily: "每日 1 次（早班）", twice_daily: "每日 2 次（早班+晚班）" } as const;

/** The quota function counts the calendar month in Mexico City, so this must too — see claim_free_tender_view in migration 0055. */
function mexicoMonthStart(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  return `${parts}-01`;
}

async function main() {
  // Arguments before credentials: forgetting the flag is the common mistake,
  // and it should say so rather than first reporting a Supabase problem the
  // caller does not have.
  const email = argValue("--email");
  let userId = argValue("--user");
  if (!email && !userId) {
    console.error("要一个 --email 或 --user。例：npm run check:subscription-state -- --email qa-pro@example.com");
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。见 .env.example。");
    process.exit(1);
  }

  let shownEmail = email ?? "";
  if (!userId) {
    // listUsers is paged; the address is matched case-insensitively because
    // Supabase stores what the person typed at signup.
    const wanted = email!.trim().toLowerCase();
    for (let page = 1; page <= 20 && !userId; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`用户检索失败：${error.message}`);
      if (!data.users.length) break;
      const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
      if (hit) { userId = hit.id; shownEmail = hit.email ?? wanted; }
    }
    if (!userId) {
      console.error(`找不到邮箱为 ${email} 的账号。注意这查的是 auth 用户，不是 profiles。`);
      process.exit(1);
    }
  }

  console.log(`\n账号  ${shownEmail || "(按 id 查询)"}\nid    ${userId}\n${"─".repeat(72)}`);

  // ---- 1. 订阅行（镜像 findCurrentSubscription 的查询）----
  const { data: subRows, error: subError } = await admin
    .from("subscriptions")
    .select("id, user_id, plan, status, created_at, current_period_start, current_period_end, cancel_at_period_end, billing_interval, stripe_subscription_id, payment_source")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (subError) throw new Error(`订阅读取失败：${subError.message}`);
  const all = (subRows ?? []) as unknown as SubscriptionRow[];
  const live = all.filter((r) => ["active", "trialing", "past_due"].includes(r.status));
  const selected = selectPreferredSubscription(live);

  console.log(`\n【订阅】共 ${all.length} 行，其中 ${live.length} 行处于 active/trialing/past_due`);
  if (all.length === 0) console.log("  （没有订阅行 —— 付款成功却没有行，就是 webhook 没落库）");
  for (const r of all) {
    const mark = selected && r.id === selected.id ? "★ 生效" : "  ";
    console.log(`  ${mark} ${r.plan}/${r.status}  ${r.billing_interval ?? "?"}  ${String(r.current_period_start ?? "?").slice(0, 10)} → ${String(r.current_period_end ?? "?").slice(0, 10)}`);
    console.log(`        stripe=${r.stripe_subscription_id ?? "无"}  来源=${r.payment_source ?? "?"}  取消于期末=${r.cancel_at_period_end ? "是" : "否"}  id=${r.id}`);
    if (!isSubscriptionEntitled(r.status, r.current_period_start, r.current_period_end)) console.log("        ↳ 这一行当前不授予权限");
  }
  const dupes = new Map<string, number>();
  for (const r of all) if (r.stripe_subscription_id) dupes.set(r.stripe_subscription_id, (dupes.get(r.stripe_subscription_id) ?? 0) + 1);
  for (const [sid, n] of dupes) if (n > 1) console.log(`  ⚠ 同一个 Stripe 订阅 ${sid} 写进了 ${n} 行 —— 这正是 0022 修过的重复写入`);

  // ---- 2. 权限（用站点自己的函数推导）----
  let entitlement: ViewerEntitlement;
  let selectedCountry: string | null = null;
  if (selected) {
    const sel = selected;
    if (sel.plan === "basic") {
      const { data, error } = await admin.from("basic_plan_countries").select("country").eq("subscription_id", sel.id).maybeSingle();
      if (error) throw new Error(`基础版国家读取失败：${error.message}`);
      selectedCountry = (data?.country as string | undefined) ?? null;
    }
    entitlement = { role: "subscriber", plan: sel.plan as SubscriptionPlan, selectedCountry, trialEndsAt: null, subscriptionOwnerUserId: userId, isEnterpriseOwner: sel.plan === "enterprise", periodStart: null, periodEnd: null, cancelAtPeriodEnd: false, billingInterval: null, paymentPastDue: false, hasBillingLink: false };
  } else {
    const { data: profile } = await admin.from("profiles").select("trial_ends_at").eq("id", userId).maybeSingle();
    const trialEndsAt = (profile?.trial_ends_at as string | undefined) ?? null;
    const inTrial = trialEndsAt !== null && new Date(trialEndsAt).getTime() > Date.now();
    entitlement = { role: inTrial ? "trial" : "free", plan: null, selectedCountry: null, trialEndsAt, subscriptionOwnerUserId: null, isEnterpriseOwner: false, periodStart: null, periodEnd: null, cancelAtPeriodEnd: false, billingInterval: null, paymentPastDue: false, hasBillingLink: false };
    console.log(`\n【试用】trial_ends_at=${trialEndsAt ?? "未设置"}（TRIAL_DAYS=${TRIAL_DAYS}）${inTrial ? " —— 仍在试用期内" : ""}`);
  }

  // ---- 3. 企业席位 ----
  const { data: seats } = await admin.from("enterprise_members").select("owner_user_id, status").eq("member_user_id", userId);
  const acceptedOwner = (seats ?? []).find((s) => s.status === "accepted")?.owner_user_id as string | undefined;
  if (seats?.length) console.log(`\n【企业席位】${seats.map((s) => `${s.status}→owner ${String(s.owner_user_id).slice(0, 8)}…`).join("， ")}`);
  if (acceptedOwner && entitlement.role !== "subscriber") console.log("  注意：席位已接受，但要 owner 的企业订阅仍然有效才授予权限");

  console.log(`\n【当前身份】role=${entitlement.role}  plan=${entitlement.plan ?? "—"}${selectedCountry ? `  选定国家=${selectedCountry}` : ""}`);
  console.log(`  可导出当前清单：${canExportTenders(entitlement) ? "是" : "否"}`);
  console.log(`  可导出历史清单：${entitlement.role === "subscriber" && entitlement.plan === "enterprise" ? "是" : "否"}`);
  const countries = ["Mexico", "Brazil", "Colombia", "Peru"];
  console.log(`  各国完整详情：${countries.map((c) => `${c}=${canViewCountry(entitlement, c) ? "✓" : "✗"}`).join("  ")}`);

  // ---- 4. 免费额度 ----
  const monthStart = mexicoMonthStart();
  const { data: views } = await admin.from("free_tender_views").select("tender_id").eq("user_id", userId).eq("month_start", monthStart);
  const used = views?.length ?? 0;
  console.log(`\n【免费额度】${monthStart} 起本月已用 ${used}/5${entitlement.role === "free" ? "" : "（当前身份不消耗额度）"}`);

  // ---- 5. 提醒 ----
  // email_notification_preferences, not notification_preferences (migration
  // 0017, and digest-recipients.ts reads the same name). The error is checked
  // rather than dropped: a wrong table name answers `null` with an error set,
  // which reads identically to "this account never turned alerts on" — the
  // reconciliation would then report a real subscriber as having no alerts
  // and give no hint that it had asked the wrong question.
  const { data: pref, error: prefError } = await admin
    .from("email_notification_preferences")
    .select("enabled, countries, industries, statuses, relevance_tiers, keywords")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefError) throw new Error(`提醒偏好读取失败：${prefError.message}`);
  const cadence = digestCadence(entitlement.plan, acceptedOwner !== undefined, entitlement.role === "trial");
  console.log(`\n【提醒】开关=${pref ? (pref.enabled ? "开" : "关") : "没有偏好行"}  频率=${CADENCE_LABEL[cadence]}`);
  if (pref) {
    const kw = (pref.keywords as string[] | null) ?? [];
    console.log(`  国家=${((pref.countries as string[] | null) ?? []).join(",") || "全部"}  行业=${((pref.industries as string[] | null) ?? []).join(",") || "全部"}  关键词=${kw.join(",") || "无"}`);
    if (entitlement.plan === "basic" && kw.length) console.log("  ↳ 基础版发信时会剥掉关键词（digest-recipients.ts），存着不等于生效");
    if (cadence === "weekly" && kw.length) console.log("  ↳ 免费版发信时会剥掉关键词，同上");
  }
  console.log(`\n${"─".repeat(72)}\n只读：本脚本没有写入任何一张表，也没有消耗免费额度。\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
