import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { fetchUserActivity } from "@/lib/db/user-activity";
import { activeInLast24h, sendUserActivityDigest } from "@/lib/notifications/user-activity-digest";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Once a day (vercel.json, 01:12 UTC = 09:12 Beijing): one email to the
 * operators naming the registered users who viewed pages in the last 24
 * hours. Read-only; touches nothing a visitor sees. See
 * lib/notifications/user-activity-digest.ts.
 */
async function run(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  try {
    const now = new Date();
    const activity = await fetchUserActivity(now);
    if (!activity) {
      await recordCronHeartbeat(admin, "user-activity-digest", "skipped", "数据库未配置");
      return NextResponse.json({ sent: false, reason: "database not configured" });
    }
    const active = activeInLast24h(activity.rows);
    if (active.length === 0) {
      await recordCronHeartbeat(admin, "user-activity-digest", "ok", "近 24 小时没有注册用户访问，未发邮件");
      return NextResponse.json({ sent: false, active: 0 });
    }
    const sent = await sendUserActivityDigest(active, now.toISOString().slice(0, 10));
    await recordCronHeartbeat(admin, "user-activity-digest", sent ? "ok" : "skipped", sent ? `已发送：${active.length} 位用户访问` : "邮件未配置（RESEND 或收件人），未发送");
    return NextResponse.json({ sent, active: active.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCronHeartbeat(admin, "user-activity-digest", "failed", message);
    await reportOpsFailure(admin, { source: "user-activity-digest", title: "注册用户访问汇总邮件发送失败", message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}
