import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/notifications/escape-html";

/**
 * One operational failure, reported once.
 *
 * stripe-webhook-alert.ts does this for Stripe events, backed by the
 * per-event state machine migration 0036 installed. Everything else that runs
 * unattended — the digest cron, the purge cron — had console.error and
 * nothing else, which on Vercel means the failure exists only in a log nobody
 * reads. This is the general version for those: a row in admin_alerts so the
 * /admin banner shows it, plus one email to whoever WEBHOOK_ALERT_EMAILS
 * names.
 *
 * The dedupe key is `source`, and it is per incident, not per run: while an
 * unresolved row with the same source exists, a repeat writes nothing and
 * sends nothing. So a digest failing for the same recipient twice a day for a
 * week is one row and one email, not fourteen — and dismissing the banner row
 * is what re-arms it. Callers therefore want a source that identifies the
 * FAILING THING (`tender-digest:recipient:<id>`), not the moment
 * (`tender-digest:2026-09-11`).
 */
export type OpsAlertInput = {
  /** Stable per incident — see the dedupe note above. */
  source: string;
  /** Email subject line, e.g. 每日摘要邮件发送失败. */
  title: string;
  message: string;
  kind?: "quota" | "connection" | "other";
};

function recipients(): string[] {
  return (process.env.WEBHOOK_ALERT_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

async function sendOpsEmail(input: OpsAlertInput & { alertId: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = recipients();
  if (!apiKey || !from || to.length === 0) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // The alert row's id, so a retry of this same call cannot produce a
      // second email even if the insert above succeeded and the send didn't.
      "Idempotency-Key": `ops-alert/${input.alertId}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: `拉美招投标信息平台｜${input.title}`,
      html:
        `<main style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#52636e">` +
        `<h1 style="color:#071826;font-size:22px">${escapeHtml(input.title)}</h1>` +
        `<p><strong>来源：</strong>${escapeHtml(input.source)}</p>` +
        `<p><strong>错误：</strong>${escapeHtml(input.message)}</p>` +
        `<p style="font-size:12px;margin-top:28px">此告警同时显示在管理后台顶部横幅，处理后请在后台标记为已处理；在标记之前，同一问题不会再次发送邮件。</p>` +
        `</main>`,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}.`);
  return true;
}

/**
 * Never throws and never returns a rejected promise: every caller is inside a
 * failure path already, and an alert that fails must not replace the original
 * error with its own.
 *
 * Returns whether an email went out — false covers both "already reported"
 * and "email isn't configured", which callers other than the admin test
 * button have no reason to tell apart.
 */
export async function reportOpsFailure(admin: SupabaseClient | null, input: OpsAlertInput): Promise<boolean> {
  if (!admin) return false;
  try {
    const { data: existing } = await admin
      .from("admin_alerts")
      .select("id")
      .eq("source", input.source)
      .is("resolved_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) return false;

    const { data: inserted, error } = await admin
      .from("admin_alerts")
      .insert({ kind: input.kind ?? "other", source: input.source, message: `${input.title}：${input.message}`.slice(0, 2000) })
      .select("id")
      .single();
    if (error || !inserted) return false;

    return await sendOpsEmail({ ...input, alertId: inserted.id as string });
  } catch (err) {
    console.error("[ops-alert] Could not report failure", input.source, err);
    return false;
  }
}

/** Marks an incident handled so the next failure of the same thing reports again. */
export async function resolveOpsFailure(admin: SupabaseClient | null, source: string): Promise<void> {
  if (!admin) return;
  try {
    await admin.from("admin_alerts").update({ resolved_at: new Date().toISOString() }).eq("source", source).is("resolved_at", null);
  } catch {
    // best effort
  }
}
