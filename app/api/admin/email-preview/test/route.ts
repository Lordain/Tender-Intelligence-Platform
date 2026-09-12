import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createRateLimiter } from "@/lib/security/rate-limit";
import {
  previewPreference,
  previewStatusChanges,
  previewTenders,
} from "@/lib/notifications/tender-digest-preview";
import { sendTenderDigestEmail } from "@/lib/notifications/tender-digest";
import { sendSubscriptionRenewalReminder } from "@/lib/notifications/subscription-renewal-reminder";
import { sendEnterpriseInviteEmail } from "@/lib/notifications/enterprise-invite";

export const runtime = "nodejs";

const isRateLimited = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
  if (isRateLimited(admin.id)) return NextResponse.json({ error: "测试邮件发送过于频繁，请一小时后再试。" }, { status: 429 });

  try {
    const kind = new URL(request.url).searchParams.get("kind");

    // The enterprise invitation is the only paid-flow email with no other way
    // to reach it: sending a real one needs an enterprise OWNER, and an admin
    // is deliberately not one (getViewerEntitlement leaves isEnterpriseOwner
    // false — access, not a fabricated subscription). So this sends the real
    // template to the admin's own address and writes no enterprise_members
    // row: nobody is invited, nothing is granted, and the message is inert
    // anyway — it carries no token, and an invitation is redeemed from inside
    // the account whose address it names.
    if (kind === "invite") {
      const delivered = await sendEnterpriseInviteEmail(admin.email, "企业版主账号（测试）");
      if (!delivered) {
        return NextResponse.json(
          { error: "邀请邮件没有发出。请检查 RESEND_API_KEY、RESEND_FROM_EMAIL 和 APP_URL。" },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: true, message: `企业邀请测试邮件已发送到当前管理员邮箱 ${admin.email}（未创建任何邀请记录）。` });
    }

    if (kind === "renewal") {
      const periodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await sendSubscriptionRenewalReminder({
        to: admin.email,
        subscriptionId: `test-${crypto.randomUUID()}`,
        plan: "professional",
        interval: "monthly",
        amountMinor: 100_000,
        currency: "usd",
        periodEnd,
      });
      return NextResponse.json({ ok: true, message: `续费提醒测试邮件已发送到当前管理员邮箱 ${admin.email}。` });
    }
    await sendTenderDigestEmail(
      {
        user_id: admin.id,
        email: admin.email,
        enabled: true,
        ...previewPreference,
      },
      previewTenders,
      previewStatusChanges,
      { test: true },
    );
    return NextResponse.json({ ok: true, message: `测试邮件已发送到当前管理员邮箱 ${admin.email}。` });
  } catch (error) {
    console.error("[admin-email-preview-test] Delivery failed", error);
    return NextResponse.json({ error: "测试邮件发送失败，请检查生产环境邮件配置。" }, { status: 500 });
  }
}
