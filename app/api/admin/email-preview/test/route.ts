import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createRateLimiter } from "@/lib/security/rate-limit";
import {
  previewPreference,
  previewStatusChanges,
  previewTenders,
} from "@/lib/notifications/tender-digest-preview";
import { sendTenderDigestEmail } from "@/lib/notifications/tender-digest";

export const runtime = "nodejs";

const isRateLimited = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });

export async function POST() {
  const admin = await getAdminUser();
  if (!admin?.email) return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
  if (isRateLimited(admin.id)) return NextResponse.json({ error: "测试邮件发送过于频繁，请一小时后再试。" }, { status: 429 });

  try {
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
