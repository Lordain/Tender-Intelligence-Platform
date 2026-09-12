/**
 * Prints every subscription the entitlement code would treat as live, with
 * the date each one actually ends. Read-only — it writes nothing.
 *
 * Worth having because nothing in this codebase moves current_period_end
 * forward: only a payment provider's webhook can. Until checkout is
 * connected, a subscription silently stops on its end date whether or not
 * anyone cancelled it, and the only way to see that coming is to look. Rows
 * are flagged when they have no end date (they would never expire), when
 * they have already expired but are still marked active, and when they have
 * no billing link (nothing will renew them).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and migrations through 0027.
 *
 * Usage: npm run list:subscriptions
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type Row = {
  user_id: string;
  plan: string;
  status: string;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_subscription_id: string | null;
};

const INTERVALS: Record<string, string> = { monthly: "按月", semiannual: "半年", annual: "年度" };
const DAY = 86_400_000;
const date = (value: string | null) => (value ? value.slice(0, 10) : "—");

async function main() {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set.");

  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id, plan, status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id")
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: true });
  if (error) throw new Error(`订阅读取失败：${error.message}`);

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    console.log("没有有效订阅。");
    return;
  }

  const emailById = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) throw new Error(`listUsers 失败：${usersError.message}`);
    for (const user of users.users) if (user.email) emailById.set(user.id, user.email);
    if (users.users.length < 1000) break;
  }

  const now = Date.now();
  const warnings: string[] = [];
  console.log(`${rows.length} 个有效订阅：\n`);
  console.log(`${"邮箱".padEnd(32)}${"套餐".padEnd(14)}${"周期".padEnd(8)}${"开始".padEnd(12)}${"到期".padEnd(12)}剩余`);
  console.log("-".repeat(96));

  for (const row of rows) {
    const email = emailById.get(row.user_id) ?? `(已删除用户 ${row.user_id.slice(0, 8)})`;
    const plan = row.plan === "enterprise" ? "企业版" : row.plan === "professional" ? "个人版" : row.plan;
    const interval = INTERVALS[row.billing_interval ?? ""] ?? row.billing_interval ?? "—";

    let remaining: string;
    if (!row.current_period_end) {
      remaining = "无到期日";
      warnings.push(`${email}：没有到期时间，这条订阅永远不会失效，也无法取消。`);
    } else {
      const days = Math.ceil((new Date(row.current_period_end).getTime() - now) / DAY);
      remaining = days < 0 ? `已过期 ${-days} 天` : `${days} 天`;
      if (days < 0) warnings.push(`${email}：已于 ${date(row.current_period_end)} 到期，但状态仍是 ${row.status}。`);
      else if (days <= 7) warnings.push(`${email}：${days} 天后到期（${date(row.current_period_end)}）。`);
    }

    const flags = [
      row.cancel_at_period_end ? "已取消续期" : null,
      row.stripe_subscription_id ? null : "未接入自动续期",
    ].filter(Boolean).join(" · ");

    console.log(
      `${email.padEnd(32)}${plan.padEnd(14)}${interval.padEnd(8)}${date(row.current_period_start).padEnd(12)}${date(row.current_period_end).padEnd(12)}${remaining}${flags ? `  [${flags}]` : ""}`,
    );
    if (!row.stripe_subscription_id) {
      warnings.push(`${email}：没有支付方订阅 ID，到期后不会自动续期。`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n需要注意（${warnings.length}）：`);
    for (const warning of [...new Set(warnings)]) console.log(`  · ${warning}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
