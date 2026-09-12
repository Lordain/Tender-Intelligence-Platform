import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { reportStripeWebhookFailure, resolveStripeWebhookFailure } from "@/lib/notifications/stripe-webhook-alert";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

export async function POST() {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "数据库服务未配置。" }, { status: 503 });

  const event = { id: `monitor_test_${crypto.randomUUID()}`, type: "monitor.test" };
  const failureEmailSent = await reportStripeWebhookFailure(admin, event, new Error("这是管理员发起的 Webhook 告警测试，不代表真实支付失败。"));
  const recoveryEmailSent = await resolveStripeWebhookFailure(admin, event);
  if (!failureEmailSent || !recoveryEmailSent) {
    return NextResponse.json({ error: "测试记录已生成，但邮件没有全部发出。请检查 WEBHOOK_ALERT_EMAILS、RESEND_API_KEY 和 RESEND_FROM_EMAIL。" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, message: "失败告警和恢复通知均已发送，请检查管理员邮箱。" });
}
