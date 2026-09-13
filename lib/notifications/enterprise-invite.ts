import "server-only";
import { escapeHtml } from "@/lib/notifications/escape-html";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * Tell someone an enterprise seat is waiting for them. Deliberately carries
 * no token: the invitation is accepted from inside the account whose email
 * address it names, so the only thing that can redeem it is a signed-in
 * session for that address — nothing in this message grants anything, and a
 * forwarded copy of it is inert.
 *
 * Returns false rather than throwing when email isn't configured or Resend
 * rejects the send. The invitation row is the source of truth and is already
 * written by the time this runs; a failed notification must not fail the
 * request or lose the invitation, it just means the invitee finds it the
 * next time they open 账户管理.
 */
export async function sendEnterpriseInviteEmail(to: string, invitedBy: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!apiKey || !from || !appUrl) return false;

  const accountUrl = new URL("/account", appUrl).toString();
  const registerUrl = new URL(`/register?email=${encodeURIComponent(to)}&next=/account`, appUrl).toString();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "拉美招投标信息平台｜企业版账号邀请",
        // A reply that reaches a person is a legitimacy signal, and this is
        // the one message in the set a confused recipient genuinely wants to
        // answer ("who invited me?"). It has to be a mailbox someone reads:
        // RESEND_FROM_EMAIL is a no-reply sender, so pointing Reply-To back
        // at it sent that question into a hole while still claiming a human
        // was on the other end.
        reply_to: SUPPORT_EMAIL,
        // multipart/alternative. Gmail put this exact message in 垃圾邮件 on
        // 2026-09-13 while the digest from the same domain and the same
        // Resend account reached the inbox; both were HTML-only, and this one
        // has the shape filters are most suspicious of — a short body, one
        // large call-to-action button, and a second link going somewhere
        // else. The text part is written out rather than stripped from the
        // HTML so it reads as a real message.
        text: [
          "您收到一份企业版账号邀请",
          `${invitedBy} 邀请您加入其企业版订阅。接受后，您将获得完整的项目查看权限，并可设置自己的邮件通知条件。`,
          "邀请需要您本人确认才会生效。请登录后前往「账户管理」页面接受或拒绝：",
          accountUrl,
          `还没有账号？先用本邮箱注册后，即可在同一页面看到这份邀请：${registerUrl}`,
          "如果您不认识邀请方，忽略这封邮件即可——未经您确认，不会有任何账号变更。",
        ].join("\n\n"),
        html: `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e">`
          + `<h1 style="color:#071826;font-size:22px">您收到一份企业版账号邀请</h1>`
          + `<p><strong style="color:#071826">${escapeHtml(invitedBy)}</strong> 邀请您加入其企业版订阅。接受后，您将获得完整的项目查看权限，并可设置自己的邮件通知条件。</p>`
          + `<p>邀请需要您本人确认才会生效。请登录后前往「账户管理」页面接受或拒绝。</p>`
          + `<p style="margin:28px 0"><a href="${accountUrl}" style="display:inline-block;background:#ffb21c;color:#071826;padding:11px 18px;border-radius:8px;font-weight:700;text-decoration:none">前往账户管理</a></p>`
          + `<p style="font-size:13px">还没有账号？<a href="${registerUrl}" style="color:#0a2b40">先用本邮箱注册</a>，注册后即可在同一页面看到这份邀请。</p>`
          + `<p style="margin-top:24px;font-size:12px">如果您不认识邀请方，忽略这封邮件即可——未经您确认，不会有任何账号变更。</p>`
          + `</main>`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
