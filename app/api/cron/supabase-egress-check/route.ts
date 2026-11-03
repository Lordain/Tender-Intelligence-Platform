import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { assessEgress, DAILY_ALERT_BYTES, FREE_PLAN_EGRESS_BYTES, formatEgressBytes, type EgressDayRow } from "@/lib/ops/supabase-egress";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Once a day (vercel.json): the platform's own Supabase egress count
 * (lib/ops/supabase-egress.ts) against the Free plan's 5 GB, so the admin
 * hears about it before Supabase restricts the project as it did on
 * 2026-10-30 (user, 2026-11-03: A. 平台自己记账).
 *
 * Emails through reportOpsFailure, once per billing cycle for each of 60%,
 * 80% and 100%, and once per day for a day over 300 MB. The source key
 * carries the cycle (or the day), so a new cycle can warn again.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  const now = new Date();
  const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("supabase_egress_daily").select("day, bytes").gte("day", since);
  if (error) {
    await recordCronHeartbeat(admin, "supabase-egress-check", "failed", `读不到流量记账表：${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usage = assessEgress((data ?? []) as EgressDayRow[], now);
  const summary = `本计费周期（${usage.cycleStart} 起）平台记录 ${formatEgressBytes(usage.cycleBytes)} / ${formatEgressBytes(FREE_PLAN_EGRESS_BYTES)}（${Math.round(usage.cycleShare * 100)}%），${usage.lastDay} 一天 ${formatEgressBytes(usage.lastDayBytes)}`;
  const alerts: string[] = [];

  if (usage.cycleLevel !== null) {
    const percent = Math.round(usage.cycleLevel * 100);
    const sent = await reportOpsFailure(admin, {
      source: `supabase-egress:cycle:${usage.cycleStart}:${percent}`,
      kind: "quota",
      title: `Supabase 流量已用到免费额度的 ${percent}%`,
      message: `${summary}。平台自己的记账不含浏览器直连 Supabase 的部分，实际用量会略高；请到 Supabase 后台 Usage 页面核对。超过 100% 后 Supabase 会限制服务，网站将读不到数据。`,
    });
    if (sent) alerts.push(`${percent}%`);
  }
  if (usage.dailyOver) {
    const sent = await reportOpsFailure(admin, {
      source: `supabase-egress:day:${usage.lastDay}`,
      kind: "quota",
      title: `Supabase 一天流量超过 ${formatEgressBytes(DAILY_ALERT_BYTES)}`,
      message: `${summary}。按这个速度，5 GB 的免费额度撑不到月底，请检查是否有页面或任务在反复读取全部数据（例如本地开发服务器不停刷新）。`,
    });
    if (sent) alerts.push("daily");
  }

  await recordCronHeartbeat(admin, "supabase-egress-check", "ok", `${summary}${alerts.length ? `；已发提醒：${alerts.join("、")}` : ""}`);
  return NextResponse.json({ ...usage, alerts });
}
