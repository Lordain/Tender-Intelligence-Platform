import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/notifications/escape-html";

function recipients(): string[] {
  return (process.env.WEBHOOK_ALERT_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

async function sendAlertEmail(input: {
  eventId: string;
  eventType: string;
  error?: string;
  recovered: boolean;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = recipients();
  if (!apiKey || !from || to.length === 0) return false;

  const eventUrl = `https://dashboard.stripe.com/events/${encodeURIComponent(input.eventId)}`;
  const state = input.recovered ? "已恢复" : "处理失败";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `stripe-webhook-${input.recovered ? "recovered" : "failed"}/${input.eventId}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: `拉美招投标信息平台｜Stripe Webhook ${state}`,
      html: `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e">`
        + `<h1 style="color:#071826;font-size:22px">Stripe Webhook ${state}</h1>`
        + `<p><strong>事件类型：</strong>${escapeHtml(input.eventType)}</p>`
        + `<p><strong>事件编号：</strong>${escapeHtml(input.eventId)}</p>`
        + (input.error ? `<p><strong>错误：</strong>${escapeHtml(input.error)}</p>` : `<p>Stripe 后续重试已成功处理该事件。</p>`)
        + `<p style="margin:28px 0"><a href="${eventUrl}" style="display:inline-block;background:#ffb21c;color:#071826;padding:11px 18px;border-radius:8px;font-weight:700;text-decoration:none">在 Stripe 中查看事件</a></p>`
        + `<p style="font-size:12px">本邮件为生产支付监控通知，请勿转发其中的内部事件信息。</p>`
        + `</main>`,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
  return true;
}

async function ensureAdminAlert(admin: SupabaseClient, eventId: string, eventType: string, message: string) {
  const source = `stripe-webhook:${eventId}`;
  const { data } = await admin.from("admin_alerts").select("id").eq("source", source).is("resolved_at", null).limit(1).maybeSingle();
  if (!data) await admin.from("admin_alerts").insert({ kind: "other", source, message: `${eventType}: ${message}`.slice(0, 2000) });
}

export async function reportStripeWebhookFailure(
  admin: SupabaseClient,
  event: { id: string; type: string },
  error: unknown,
): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const { data: shouldNotify, error: stateError } = await admin.rpc("record_stripe_webhook_failure", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_error: message,
  });
  if (stateError) console.error("[stripe-webhook-alert] Failed to record failure", stateError);
  await ensureAdminAlert(admin, event.id, event.type, message).catch(() => {});
  if (shouldNotify === false) return true;

  try {
    const sent = await sendAlertEmail({ eventId: event.id, eventType: event.type, error: message, recovered: false });
    if (sent) await admin.rpc("mark_stripe_webhook_notification", { p_event_id: event.id, p_notification: "failure" });
    return sent;
  } catch (emailError) {
    console.error("[stripe-webhook-alert] Failure email could not be sent", emailError);
    return false;
  }
}

export async function resolveStripeWebhookFailure(
  admin: SupabaseClient,
  event: { id: string; type: string },
): Promise<boolean> {
  const { data: shouldNotify, error: stateError } = await admin.rpc("resolve_stripe_webhook_failure", { p_event_id: event.id });
  if (stateError) {
    console.error("[stripe-webhook-alert] Failed to resolve failure", stateError);
    return false;
  }
  if (!shouldNotify) return true;

  await admin.from("admin_alerts").update({ resolved_at: new Date().toISOString() }).eq("source", `stripe-webhook:${event.id}`).is("resolved_at", null);
  try {
    const sent = await sendAlertEmail({ eventId: event.id, eventType: event.type, recovered: true });
    if (sent) await admin.rpc("mark_stripe_webhook_notification", { p_event_id: event.id, p_notification: "recovery" });
    return sent;
  } catch (emailError) {
    console.error("[stripe-webhook-alert] Recovery email could not be sent", emailError);
    return false;
  }
}
