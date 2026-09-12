import "server-only";

import { PLAN_NAMES, type PaidPlan } from "@/lib/billing-catalog";
import type { BillingInterval } from "@/lib/access-control";
import { escapeHtml } from "@/lib/notifications/escape-html";

const INTERVAL_NAMES: Record<BillingInterval, string> = {
  monthly: "按月",
  semiannual: "每半年",
  annual: "每年",
};

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "code",
  }).format(amountMinor / 100);
}

function renewalDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export async function sendSubscriptionRenewalReminder(input: {
  to: string;
  subscriptionId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  amountMinor: number;
  currency: string;
  periodEnd: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Renewal reminder email is not configured.");

  const accountUrl = new URL("/account", process.env.APP_URL || "https://latintender.com").toString();
  const date = renewalDate(input.periodEnd);
  const amount = money(input.amountMinor, input.currency);
  const subject = `拉美招投标信息平台｜订阅将于${date}自动续费`;
  const html = `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e;line-height:1.7">`
    + `<h1 style="color:#071826;font-size:22px">订阅自动续费提醒</h1>`
    + `<p>你的拉美招投标信息平台订阅预计将于 <strong>${escapeHtml(date)}</strong> 自动续费。</p>`
    + `<div style="margin:22px 0;padding:18px;border:1px solid #dbe2e5;border-radius:12px;background:#f7f9f8">`
    + `<p style="margin:0 0 8px"><strong>套餐：</strong>${escapeHtml(PLAN_NAMES[input.plan])}</p>`
    + `<p style="margin:0 0 8px"><strong>计费周期：</strong>${escapeHtml(INTERVAL_NAMES[input.interval])}</p>`
    + `<p style="margin:0 0 8px"><strong>预计扣款金额：</strong>${escapeHtml(amount)}</p>`
    + `<p style="margin:0"><strong>预计扣款日期：</strong>${escapeHtml(date)}</p></div>`
    + `<p>该金额来自 Stripe 当前下一期账单预览；如果你在扣款前更改套餐、获得折扣或税费发生变化，最终账单可能相应调整。</p>`
    + `<p>如不希望续费，可在扣款前进入账户页面取消自动续费，不收取取消费用。取消后，当前已付费权限仍保留至本周期结束。</p>`
    + `<p style="margin:28px 0"><a href="${escapeHtml(accountUrl)}" style="display:inline-block;background:#ffb21c;color:#071826;padding:11px 18px;border-radius:8px;font-weight:700;text-decoration:none">管理订阅</a></p>`
    + `<p style="margin-top:28px;font-size:12px">拉美招投标信息平台自动通知，请勿直接回复本邮件。</p></main>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `subscription-renewal/${input.subscriptionId}/${input.periodEnd}`,
    },
    body: JSON.stringify({ from, to: [input.to], subject, html }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Resend did not return an email ID.");
  return result.id;
}
