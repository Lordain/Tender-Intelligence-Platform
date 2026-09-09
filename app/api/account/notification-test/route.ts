import { NextResponse } from "next/server";
import { canConfigureEmailNotifications } from "@/lib/access-control";
import { getViewerEntitlement } from "@/lib/access-control-server";
import {
  getDigestRecipients,
  getNewTenders,
  matchingTenders,
  notificationsEnabled,
  sendTenderDigestEmail,
} from "@/lib/notifications/tender-digest";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

const isRateLimited = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    if (isRateLimited(user.id)) return NextResponse.json({ error: "测试邮件发送过于频繁，请一小时后再试。" }, { status: 429 });
    if (!notificationsEnabled()) return NextResponse.json({ error: "生产环境尚未开启邮件通知。" }, { status: 409 });

    const entitlement = await getViewerEntitlement();
    if (!canConfigureEmailNotifications(entitlement.role)) {
      return NextResponse.json({ error: "当前账户没有订阅或试用通知权限。" }, { status: 403 });
    }

    const recipient = (await getDigestRecipients()).find((item) => item.user_id === user.id);
    if (!recipient) {
      return NextResponse.json({ error: "请先开启并保存邮件通知设置。" }, { status: 409 });
    }

    const now = new Date();
    const candidates = await getNewTenders(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), now);
    const matches = matchingTenders(candidates, recipient).slice(0, 3);
    if (matches.length === 0) {
      return NextResponse.json({ error: "最近项目没有符合当前条件的内容，请暂时放宽筛选条件后重试。" }, { status: 409 });
    }

    await sendTenderDigestEmail(recipient, matches, [], { test: true });
    return NextResponse.json({ ok: true, message: `测试邮件已发送到 ${recipient.email}，包含 ${matches.length} 个真实匹配项目。` });
  } catch (error) {
    console.error("[notification-test] Delivery failed", error);
    return NextResponse.json({ error: "测试邮件发送失败，请稍后重试。" }, { status: 500 });
  }
}
