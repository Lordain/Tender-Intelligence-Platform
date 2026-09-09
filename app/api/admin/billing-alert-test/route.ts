import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { sendBillingAlertTest } from "@/lib/notifications/stripe-billing-alert";

export const runtime = "nodejs";

export async function POST() {
  const user = await getAdminUser();
  if (!user?.email) return NextResponse.json({ error: "无管理员权限或管理员邮箱不可用。" }, { status: 403 });
  try {
    const sent = await sendBillingAlertTest(user.email);
    if (!sent) return NextResponse.json({ error: "邮件未发出，请检查 WEBHOOK_ALERT_EMAILS 和 Resend 配置。" }, { status: 503 });
    return NextResponse.json({ ok: true, message: "测试邮件已发送至当前管理员和告警收件人。" });
  } catch (error) {
    console.error("[billing-alert-test] Failed", error);
    return NextResponse.json({ error: "付款异常测试邮件发送失败。" }, { status: 500 });
  }
}
