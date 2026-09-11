import { NextRequest, NextResponse } from "next/server";
import {
  getDigestRecipients,
  getNewTenders,
  getStatusChanges,
  matchingStatusChanges,
  matchingTenders,
  notificationsEnabled,
  sendTenderDigestEmail,
} from "@/lib/notifications/tender-digest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure, resolveOpsFailure } from "@/lib/notifications/ops-alert";

export const runtime = "nodejs";
// This route sends one email per matching recipient in a loop, so it scales
// with the subscriber list, not with a fixed amount of work. 60s is the
// ceiling a Vercel Hobby project allows; raise it on Pro before the list gets
// long enough to matter, because a timeout here loses that slot's digest
// silently — the tender_digest_deliveries rows it already wrote stay
// "processing" and the slot_key guard stops a retry from resending them.
export const maxDuration = 60;

function mexicoSlot(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const slot = hour === 9 ? "morning" : hour === 18 ? "evening" : null;
  return { slot, key: slot ? `${values.year}-${values.month}-${values.day}-${slot}` : null, hoursBack: slot === "morning" ? 15 : 9 };
}

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * The scheduler reaching this route is what a heartbeat records — including
 * the two ways a run legitimately does nothing (notifications switched off,
 * or Vercel firing a few minutes outside the 09:00/18:00 slot). Those write
 * 'skipped' rather than nothing at all, because "the job ran and had nothing
 * to do" and "the job never ran" are exactly the two states this is here to
 * tell apart. See lib/ops/cron-heartbeat.ts.
 */
async function runDigest(request: NextRequest, heartbeatClient: ReturnType<typeof createSupabaseAdminClient>) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!notificationsEnabled()) {
    await recordCronHeartbeat(heartbeatClient, "tender-digest", "skipped", "EMAIL_NOTIFICATIONS_ENABLED is off");
    return NextResponse.json({ error: "Email notifications are disabled" }, { status: 409 });
  }

  const now = new Date();
  const slot = mexicoSlot(now);
  if (!slot.slot || !slot.key) {
    await recordCronHeartbeat(heartbeatClient, "tender-digest", "skipped", "Fired outside the 09:00/18:00 America/Mexico_City slots");
    return NextResponse.json({ error: "Digest only runs at 09:00 or 18:00 America/Mexico_City" }, { status: 409 });
  }
  const windowStart = new Date(now.getTime() - slot.hoursBack * 60 * 60 * 1000);
  const tenders = await getNewTenders(windowStart, now);
  const statusChanges = await getStatusChanges(windowStart, now);
  const recipients = await getDigestRecipients();
  // Same client the wrapper already built for the heartbeat — one per run.
  const supabase = heartbeatClient;
  if (!supabase) return NextResponse.json({ error: "Database is unavailable" }, { status: 503 });

  let sent = 0;
  let failed = 0;
  const recovered: string[] = [];
  for (const recipient of recipients) {
    const matches = matchingTenders(tenders, recipient);
    const matchingUpdates = matchingStatusChanges(statusChanges, recipient);
    if (matches.length === 0 && matchingUpdates.length === 0) continue;

    const { data: existing } = await supabase.from("tender_digest_deliveries")
      .select("id, status").eq("user_id", recipient.user_id).eq("slot_key", slot.key).maybeSingle();
    if (existing?.status === "sent") continue;

    const payload = { tender_ids: [...new Set([...matches.map((tender) => tender.id), ...matchingUpdates.map((change) => change.tender.id)])], status: "processing", error_message: null };
    const { data: delivery } = existing
      ? await supabase.from("tender_digest_deliveries").update(payload).eq("id", existing.id).select("id").single()
      : await supabase.from("tender_digest_deliveries").insert({ user_id: recipient.user_id, slot_key: slot.key, ...payload }).select("id").single();
    if (!delivery) continue;

    try {
      const resendId = await sendTenderDigestEmail(recipient, matches, matchingUpdates);
      await supabase.from("tender_digest_deliveries").update({ status: "sent", resend_email_id: resendId, sent_at: new Date().toISOString() }).eq("id", delivery.id);
      sent += 1;
      recovered.push(recipient.user_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await supabase.from("tender_digest_deliveries").update({ status: "failed", error_message: message.slice(0, 500) }).eq("id", delivery.id);
      failed += 1;
      // Keyed on the recipient, not the run: one report per subscriber whose
      // mail is broken, re-armed when an admin dismisses the banner row —
      // rather than two emails a day for as long as it stays broken. The
      // tender_digest_deliveries row this sits next to is the full record;
      // this is what makes anyone look at it.
      await reportOpsFailure(supabase, {
        source: `tender-digest:recipient:${recipient.user_id}`,
        title: "每日摘要邮件发送失败",
        message: `${recipient.email}：${message}`,
      });
    }
  }

  // Delivering for a recipient again clears their standing alert, so a
  // transient bounce does not need dismissing by hand.
  for (const userId of recovered) await resolveOpsFailure(supabase, `tender-digest:recipient:${userId}`);

  await recordCronHeartbeat(supabase, "tender-digest", failed > 0 ? "failed" : "ok", failed > 0 ? `${failed} 位收件人发送失败` : undefined);
  return NextResponse.json({ slot: slot.key, newTenderCount: tenders.length, statusUpdateCount: statusChanges.length, recipientCount: recipients.length, sent, failed });
}

export async function GET(request: NextRequest) {
  // A throw before or between the queries above (Supabase unreachable, a
  // schema change, Resend's client blowing up outside the per-recipient try)
  // used to surface only as a 500 in Vercel's log. The digest is a paid
  // deliverable; a slot lost this way has to reach a person.
  const heartbeatClient = createSupabaseAdminClient();
  try {
    return await runDigest(request, heartbeatClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCronHeartbeat(heartbeatClient, "tender-digest", "failed", message);
    await reportOpsFailure(heartbeatClient, {
      source: "tender-digest:run",
      title: "每日摘要任务整体失败",
      message,
    });
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}
