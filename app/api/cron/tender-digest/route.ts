import { NextRequest, NextResponse } from "next/server";
import {
  DigestAlreadySentError,
  DigestSendInFlightError,
  getDigestRecipients,
  getNewTenders,
  getStatusChanges,
  notificationsEnabled,
  planDigestSends,
  sendTenderDigestEmail,
} from "@/lib/notifications/tender-digest";
import { currentDigestSlot, digestReadWindow, isDueInSlot, resumableDigestSlot, type DigestSlot } from "@/lib/notifications/digest-slot";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure, resolveOpsFailure } from "@/lib/notifications/ops-alert";
import { isReservedEmailDomain } from "@/lib/notifications/reserved-domains";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { runDigestSendLoop } from "@/lib/notifications/digest-send-loop";

export const runtime = "nodejs";
// This route sends one email per matching recipient in a loop, so it scales
// with the subscriber list, not with a fixed amount of work. 60s is the
// ceiling a Vercel Hobby project allows.
//
// A run that would outlast it now stops STARTING sends at SEND_BUDGET_MS and
// leaves the rest to the resume call GitHub Actions makes ten minutes later
// (?resume=1, .github/workflows/digest-resume.yml). A resume rebuilds the
// same slot — windows are anchored to the slot, lib/notifications/digest-slot.ts
// — and skips every recipient already marked sent. A send that was cut off
// mid-flight is retried under the same Resend Idempotency-Key, so the person
// who did receive it is not mailed twice.
export const maxDuration = 60;
const SEND_BUDGET_MS = 45_000;
const PENDING_ALERT_SOURCE = "tender-digest:pending";

/** Entitled users with the digest on and a deliverable address; null when the list cannot be read. */
async function countWaitingRecipients(): Promise<number | null> {
  try {
    const recipients = await getDigestRecipients();
    return recipients.filter((recipient) => !isReservedEmailDomain(recipient.email)).length;
  } catch {
    return null;
  }
}

/**
 * The scheduler reaching this route is what a heartbeat records — including
 * the two ways a run legitimately does nothing (notifications switched off
 * with nobody opted in, or Vercel firing a few minutes outside the
 * 09:00/18:00 slot). Those write
 * 'skipped' rather than nothing at all, because "the job ran and had nothing
 * to do" and "the job never ran" are exactly the two states this is here to
 * tell apart. See lib/ops/cron-heartbeat.ts.
 */
async function runDigest(request: NextRequest, heartbeatClient: ReturnType<typeof createSupabaseAdminClient>) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const resume = request.nextUrl.searchParams.get("resume") === "1";
  // The first run of the slot already recorded the switch being off.
  if (resume && !notificationsEnabled()) return NextResponse.json({ resumed: true, error: "Email notifications are disabled" }, { status: 409 });
  if (!notificationsEnabled()) {
    // Off with nobody waiting is a legitimate skip. Off while entitled users
    // have the digest switched on is a failure: they get nothing, and a
    // 'skipped' heartbeat kept the admin banner quiet about it — the job
    // looked healthy every run while no customer received a digest.
    const waiting = await countWaitingRecipients();
    if (waiting === null || waiting > 0) {
      const detail = waiting === null
        ? "每日摘要总开关（EMAIL_NOTIFICATIONS_ENABLED）是关的，且读不到订阅名单，无法确认有没有用户在等摘要"
        : `每日摘要总开关（EMAIL_NOTIFICATIONS_ENABLED）是关的：${waiting} 位开启了摘要的付费用户收不到邮件。在 Vercel 环境变量里设为 true 并重新部署`;
      await recordCronHeartbeat(heartbeatClient, "tender-digest", "failed", detail);
      return NextResponse.json({ error: "Email notifications are disabled", waitingRecipients: waiting }, { status: 409 });
    }
    await recordCronHeartbeat(heartbeatClient, "tender-digest", "skipped", "EMAIL_NOTIFICATIONS_ENABLED is off (no user has the digest switched on)");
    return NextResponse.json({ error: "Email notifications are disabled", waitingRecipients: 0 }, { status: 409 });
  }

  const startedAt = Date.now();
  const now = new Date(startedAt);
  const slot = resume ? resumableDigestSlot(now) : currentDigestSlot(now);
  if (!slot) {
    // A resume outside its window is the normal case on days the first run
    // finished (or GitHub fired late) — not worth a heartbeat that would
    // overwrite the first run's.
    if (resume) return NextResponse.json({ resumed: true, error: "No digest slot to resume" }, { status: 409 });
    await recordCronHeartbeat(heartbeatClient, "tender-digest", "skipped", "Fired outside the 09:00/18:00 America/Mexico_City slots");
    return NextResponse.json({ error: "Digest only runs at 09:00 or 18:00 America/Mexico_City" }, { status: 409 });
  }
  // Same client the wrapper already built for the heartbeat — one per run.
  const supabase = heartbeatClient;
  if (!supabase) return NextResponse.json({ error: "Database is unavailable" }, { status: 503 });

  const window = digestReadWindow(slot);
  const tenders = await getNewTenders(window.start, window.end);
  const statusChanges = await getStatusChanges(window.start, window.end);
  const recipients = await getDigestRecipients();

  let undeliverable = 0;
  for (const recipient of recipients) {
    if (!isDueInSlot(slot, recipient.cadence) || !isReservedEmailDomain(recipient.email)) continue;
    // An RFC 2606 reserved domain can never receive mail, so attempting it
    // is not a test of anything — it is a guaranteed failure that files an
    // alert and reddens the heartbeat every single run. The seeded QA
    // accounts are exactly this (scripts/seed-test-accounts.ts defaults to
    // @example.com). Counted, never alerted, and the standing alert left by
    // runs that did attempt it is cleared.
    undeliverable += 1;
    await resolveOpsFailure(supabase, `tender-digest:recipient:${recipient.user_id}`);
  }
  const planned = planDigestSends(slot, recipients.filter((recipient) => !isReservedEmailDomain(recipient.email)), tenders, statusChanges);
  const deliveries = await readSlotDeliveries(supabase, slot);
  const due = planned.filter((plan) => deliveries.get(plan.recipient.user_id)?.status !== "sent");

  const { sent, failed, remaining, recovered } = await runDigestSendLoop(slot, due, {
    claim: async ({ recipient, tenders: matches, statusChanges: updates }) => {
      const existing = deliveries.get(recipient.user_id);
      const payload = { tender_ids: [...new Set([...matches.map((tender) => tender.id), ...updates.map((change) => change.tender.id)])], status: "processing", error_message: null };
      const { data } = existing
        ? await supabase.from("tender_digest_deliveries").update(payload).eq("id", existing.id).neq("status", "sent").select("id").maybeSingle()
        : await supabase.from("tender_digest_deliveries").insert({ user_id: recipient.user_id, slot_key: slot.key, ...payload }).select("id").single();
      return (data?.id as string | undefined) ?? null;
    },
    send: async ({ recipient, tenders: matches, statusChanges: updates }, idempotencyKey) => {
      try {
        return { kind: "sent", resendId: await sendTenderDigestEmail(recipient, matches, updates, { idempotencyKey }) };
      } catch (error) {
        if (error instanceof DigestAlreadySentError) return { kind: "already_sent" };
        if (error instanceof DigestSendInFlightError) return { kind: "in_flight" };
        throw error;
      }
    },
    markSent: async (id, resendId, note) => {
      await supabase.from("tender_digest_deliveries").update({ status: "sent", resend_email_id: resendId, sent_at: new Date().toISOString(), error_message: note ?? null }).eq("id", id);
    },
    markFailed: async (id, message) => {
      await supabase.from("tender_digest_deliveries").update({ status: "failed", error_message: message }).eq("id", id).neq("status", "sent");
    },
    // Keyed on the recipient, not the run: one report per subscriber whose
    // mail is broken, re-armed when an admin dismisses the banner row —
    // rather than two emails a day for as long as it stays broken. The
    // tender_digest_deliveries row this sits next to is the full record;
    // this is what makes anyone look at it. A resume retries it once.
    reportFailure: async ({ recipient }, message) => {
      await reportOpsFailure(supabase, {
        source: `tender-digest:recipient:${recipient.user_id}`,
        title: "每日摘要邮件发送失败",
        message: `${recipient.email}：${message}`,
      });
    },
    now: () => Date.now(),
  }, { startedAt, budgetMs: SEND_BUDGET_MS });

  // Delivering for a recipient again clears their standing alert, so a
  // transient bounce does not need dismissing by hand.
  for (const userId of recovered) await resolveOpsFailure(supabase, `tender-digest:recipient:${userId}`);

  // Left over for the resume: said out loud, so a resume that never comes
  // (the workflow disabled, its secret missing) is a banner, not a silence.
  if (remaining > 0) {
    await reportOpsFailure(supabase, {
      source: PENDING_ALERT_SOURCE,
      title: resume ? "每日摘要续跑后仍未发完" : "每日摘要本轮未在时限内发完",
      message: resume
        ? `${slot.key}：还有 ${remaining} 位收件人未发送。请检查收件人数量，考虑提高 Vercel 函数时限或改用批量发送。`
        : `${slot.key}：还有 ${remaining} 位收件人，10 分钟后由 GitHub Actions（digest-resume）自动续跑。续跑完成后本提醒会自动消失；如果没有消失，请检查该工作流和 CRON_SECRET。`,
    });
  } else {
    await resolveOpsFailure(supabase, PENDING_ALERT_SOURCE);
  }

  // The skipped count rides along in the heartbeat detail rather than the
  // status: a test account that cannot receive mail is not a fault, but
  // silently dropping five recipients would be its own kind of lie.
  const detail = [
    resume ? `续跑（${slot.key}）：补发 ${sent} 位` : null,
    failed > 0 ? `${failed} 位收件人发送失败` : null,
    remaining > 0 ? `${remaining} 位未发完${resume ? "" : "，等待续跑"}` : null,
    undeliverable > 0 ? `${undeliverable} 位测试账号邮箱不可投递，已跳过` : null,
  ].filter(Boolean).join("；");
  // A resume with nothing to do leaves the first run's heartbeat as it was.
  if (!resume || due.length > 0) {
    const status = failed > 0 || (resume && remaining > 0) ? "failed" : "ok";
    await recordCronHeartbeat(supabase, "tender-digest", status, detail || undefined);
  }
  return NextResponse.json({ slot: slot.key, resumed: resume, newTenderCount: tenders.length, statusUpdateCount: statusChanges.length, recipientCount: recipients.length, due: due.length, sent, failed, remaining, undeliverable });
}

/** This slot's delivery rows, by user — one read instead of one per recipient. */
async function readSlotDeliveries(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, slot: DigestSlot) {
  const rows = new Map<string, { id: string; status: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("tender_digest_deliveries")
      .select("id, user_id, status").eq("slot_key", slot.key).order("id").range(from, from + 999);
    if (error) throw new Error(`摘要发送记录读取失败：${error.message}`);
    for (const row of data ?? []) rows.set(row.user_id as string, { id: row.id as string, status: row.status as string });
    if ((data ?? []).length < 1000) return rows;
  }
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
