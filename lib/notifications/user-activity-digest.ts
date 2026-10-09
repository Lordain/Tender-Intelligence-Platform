import "server-only";
import { escapeHtml } from "@/lib/notifications/escape-html";
import type { UserActivityRow } from "@/lib/user-activity";

/**
 * One summary a day to the operators (user, 2026-10-09: 注册用户今天有访问，
 * 做成每天一封汇总，不要每次访问都提醒). Never sent to the users themselves
 * and never per visit. Nothing to report means no email.
 *
 * Same recipients as the ops alerts: WEBHOOK_ALERT_EMAILS, else ADMIN_EMAILS.
 * The body carries account emails, so it goes to staff only.
 */
function recipients(): string[] {
  return (process.env.WEBHOOK_ALERT_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

/** Users who viewed at least one page in the last 24 hours, busiest first. */
export function activeInLast24h(rows: UserActivityRow[]): UserActivityRow[] {
  return rows.filter((row) => row.pageViewsLast24h > 0).sort((a, b) => b.pageViewsLast24h - a.pageViewsLast24h);
}

function beijingTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function buildUserActivityEmail(active: UserActivityRow[], adminUrl: string): { subject: string; html: string } {
  const cell = "padding:8px 10px;border-bottom:1px solid #e1e7e9;font-size:13px;";
  const body = active
    .map(
      (row) =>
        `<tr><td style="${cell}">${escapeHtml(row.email ?? "（无邮箱）")}</td>` +
        `<td style="${cell}text-align:right"><strong>${row.pageViewsLast24h}</strong></td>` +
        `<td style="${cell}">${escapeHtml(beijingTime(row.lastSeenAt))}</td>` +
        `<td style="${cell}text-align:right">${row.pageViews}</td>` +
        `<td style="${cell}text-align:right">${row.tendersOpened}</td>` +
        `<td style="${cell}text-align:right">${row.tendersSaved}</td></tr>`,
    )
    .join("");
  return {
    subject: `拉美招投标信息平台｜近 24 小时有 ${active.length} 位注册用户访问`,
    html:
      `<main style="max-width:680px;margin:auto;font-family:Arial,sans-serif;color:#52636e">` +
      `<h1 style="color:#071826;font-size:22px">注册用户访问汇总（近 24 小时）</h1>` +
      `<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#64717c;font-size:12px">` +
      `<th style="padding:8px 10px">用户</th><th style="padding:8px 10px;text-align:right">近24小时页面</th><th style="padding:8px 10px">最近访问（北京）</th>` +
      `<th style="padding:8px 10px;text-align:right">累计页面</th><th style="padding:8px 10px;text-align:right">打开项目</th><th style="padding:8px 10px;text-align:right">收藏</th>` +
      `</tr></thead><tbody>${body}</tbody></table>` +
      `<p style="font-size:13px;margin-top:20px"><a href="${escapeHtml(adminUrl)}" style="color:#0a2b40">在后台查看每位用户的筛选和邮件通知设置</a></p>` +
      `<p style="font-size:12px;margin-top:20px">每天最多一封；没有注册用户访问的日子不发。不含管理员和测试账号。</p>` +
      `</main>`,
  };
}

/** True when an email went out. Throws on a Resend error so the cron records it. */
export async function sendUserActivityDigest(active: UserActivityRow[], dayKey: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = recipients();
  if (active.length === 0 || !apiKey || !from || to.length === 0) return false;
  const base = (process.env.APP_URL?.trim() || "https://www.latintender.com").replace(/\/+$/, "");
  const { subject, html } = buildUserActivityEmail(active, `${base}/admin/analytics`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // One per day: a retried cron call cannot send a second copy.
      "Idempotency-Key": `user-activity-digest/${dayKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
  return true;
}
