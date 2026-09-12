import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/notifications/escape-html";

function adminRecipients(): string[] {
  return (process.env.WEBHOOK_ALERT_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

async function userEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user?.email ?? null;
}

async function sendEmail(input: { to: string[]; subject: string; html: string; idempotencyKey: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from || input.to.length === 0) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
  return true;
}

function money(invoice: Stripe.Invoice): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency.toUpperCase() })
    .format(invoice.amount_due / 100);
}

function emailShell(title: string, body: string): string {
  return `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e">`
    + `<h1 style="color:#071826;font-size:22px">${escapeHtml(title)}</h1>${body}`
    + `<p style="margin-top:28px;font-size:12px">拉美招投标信息平台自动通知，请勿直接回复本邮件。</p></main>`;
}

async function ensureAdminAlert(admin: SupabaseClient, source: string, message: string) {
  const { data, error: readError } = await admin.from("admin_alerts").select("id").eq("source", source).is("resolved_at", null).limit(1).maybeSingle();
  if (readError) throw new Error(`Billing alert lookup failed: ${readError.message}`);
  if (!data) {
    const { error: insertError } = await admin.from("admin_alerts").insert({ kind: "other", source, message: message.slice(0, 2000) });
    if (insertError) throw new Error(`Billing alert insert failed: ${insertError.message}`);
  }
}

function stripeInvoiceUrl(invoice: Stripe.Invoice): string {
  const mode = invoice.livemode ? "" : "/test";
  return `https://dashboard.stripe.com${mode}/invoices/${encodeURIComponent(invoice.id)}`;
}

async function waitForEmails(sends: Promise<boolean>[]): Promise<void> {
  const results = await Promise.allSettled(sends);
  for (const result of results) {
    if (result.status === "rejected") console.error("[stripe-billing-alert] Email could not be sent", result.reason);
    else if (!result.value) console.error("[stripe-billing-alert] Email is not configured or has no recipient");
  }
}

export async function notifyInvoicePaymentFailed(input: {
  admin: SupabaseClient;
  eventId: string;
  invoice: Stripe.Invoice;
  userId: string;
}): Promise<void> {
  const { admin, eventId, invoice, userId } = input;
  const accountUrl = new URL("/account", process.env.APP_URL || "https://latintender.com").toString();
  const invoiceUrl = invoice.hosted_invoice_url || accountUrl;
  let customer = invoice.customer_email;
  if (!customer) {
    try {
      customer = await userEmail(admin, userId);
    } catch (error) {
      console.error("[stripe-billing-alert] Customer email lookup failed", error);
    }
  }
  const source = `stripe-invoice-payment:${invoice.id}`;
  const summary = `订阅账单 ${invoice.id} 付款失败；金额 ${money(invoice)}；第 ${invoice.attempt_count ?? 1} 次尝试。`;
  await ensureAdminAlert(admin, source, summary);

  const sends: Promise<boolean>[] = [];
  if (customer) {
    sends.push(sendEmail({
      to: [customer],
      subject: "拉美招投标信息平台｜订阅付款未成功",
      idempotencyKey: `stripe-invoice-customer-failed/${eventId}`,
      html: emailShell("订阅付款未成功", `<p>Stripe 未能完成本次订阅扣款，金额为 <strong>${escapeHtml(money(invoice))}</strong>。</p>`
        + `<p>系统会按照 Stripe 的重试安排继续处理。为避免服务中断，请检查付款方式或按照账单页面提示完成付款。</p>`
        + `<p style="margin:28px 0"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#ffb21c;color:#071826;padding:11px 18px;border-radius:8px;font-weight:700;text-decoration:none">查看并处理账单</a></p>`),
    }));
  }
  const admins = adminRecipients();
  if (admins.length > 0) {
    sends.push(sendEmail({
      to: admins,
      subject: "拉美招投标信息平台｜客户订阅付款失败",
      idempotencyKey: `stripe-invoice-admin-failed/${eventId}`,
      html: emailShell("客户订阅付款失败", `<p>${escapeHtml(summary)}</p><p><strong>客户：</strong>${escapeHtml(customer ?? userId)}</p>`
        + `<p><a href="${stripeInvoiceUrl(invoice)}">在 Stripe 中查看账单</a></p>`),
    }));
  }
  await waitForEmails(sends);
}

export async function notifyInvoiceFinalizationFailed(input: {
  admin: SupabaseClient;
  eventId: string;
  invoice: Stripe.Invoice;
}): Promise<void> {
  const { admin, eventId, invoice } = input;
  const errorMessage = invoice.last_finalization_error?.message || "Stripe 未提供具体原因。";
  const source = `stripe-invoice-finalization:${invoice.id}`;
  const summary = `账单 ${invoice.id} 无法完成生成：${errorMessage}`;
  await ensureAdminAlert(admin, source, summary);
  const admins = adminRecipients();
  if (admins.length === 0) return;
  await sendEmail({
    to: admins,
    subject: "拉美招投标信息平台｜Stripe 账单生成失败",
    idempotencyKey: `stripe-invoice-finalization-failed/${eventId}`,
    html: emailShell("Stripe 账单生成失败", `<p>${escapeHtml(summary)}</p>`
      + `<p>该账单暂时无法收款，请检查 Stripe Tax、客户地址及账单设置。</p>`
      + `<p><a href="${stripeInvoiceUrl(invoice)}">在 Stripe 中查看账单</a></p>`),
  });
}

export async function resolveInvoiceAlerts(admin: SupabaseClient, invoiceId: string): Promise<void> {
  const { error } = await admin.from("admin_alerts").update({ resolved_at: new Date().toISOString() })
    .in("source", [`stripe-invoice-payment:${invoiceId}`, `stripe-invoice-finalization:${invoiceId}`])
    .is("resolved_at", null);
  if (error) throw new Error(`Billing alert resolution failed: ${error.message}`);
}

export async function sendBillingAlertTest(to: string): Promise<boolean> {
  const marker = crypto.randomUUID();
  const base = emailShell("订阅付款未成功（测试）", `<p>这是管理员发起的付款异常邮件测试，不代表真实客户付款失败。</p>`);
  const customerSent = await sendEmail({ to: [to], subject: "拉美招投标信息平台｜订阅付款未成功（测试）", html: base, idempotencyKey: `billing-alert-customer-test/${marker}` });
  const admins = adminRecipients();
  const adminSent = await sendEmail({
    to: admins,
    subject: "拉美招投标信息平台｜Stripe 账单生成失败（测试）",
    html: emailShell("Stripe 账单生成失败（测试）", `<p>这是管理员发起的账单生成失败通知测试，不代表真实账单异常。</p>`),
    idempotencyKey: `billing-alert-admin-test/${marker}`,
  });
  return customerSent && adminSent;
}
