import { NextRequest, NextResponse } from "next/server";
import {
  getDigestRecipients,
  getNewTenders,
  matchingTenders,
  notificationsEnabled,
  sendTenderDigestEmail,
} from "@/lib/notifications/tender-digest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

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

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!notificationsEnabled()) return NextResponse.json({ error: "Email notifications are disabled" }, { status: 409 });

  const now = new Date();
  const slot = mexicoSlot(now);
  if (!slot.slot || !slot.key) {
    return NextResponse.json({ error: "Digest only runs at 09:00 or 18:00 America/Mexico_City" }, { status: 409 });
  }
  const tenders = await getNewTenders(new Date(now.getTime() - slot.hoursBack * 60 * 60 * 1000), now);
  const recipients = await getDigestRecipients();
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database is unavailable" }, { status: 503 });

  let sent = 0;
  for (const recipient of recipients) {
    const matches = matchingTenders(tenders, recipient);
    if (matches.length === 0) continue;

    const { data: existing } = await supabase.from("tender_digest_deliveries")
      .select("id, status").eq("user_id", recipient.user_id).eq("slot_key", slot.key).maybeSingle();
    if (existing?.status === "sent") continue;

    const payload = { tender_ids: matches.map((tender) => tender.id), status: "processing", error_message: null };
    const { data: delivery } = existing
      ? await supabase.from("tender_digest_deliveries").update(payload).eq("id", existing.id).select("id").single()
      : await supabase.from("tender_digest_deliveries").insert({ user_id: recipient.user_id, slot_key: slot.key, ...payload }).select("id").single();
    if (!delivery) continue;

    try {
      const resendId = await sendTenderDigestEmail(recipient, matches);
      await supabase.from("tender_digest_deliveries").update({ status: "sent", resend_email_id: resendId, sent_at: new Date().toISOString() }).eq("id", delivery.id);
      sent += 1;
    } catch (error) {
      await supabase.from("tender_digest_deliveries").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" }).eq("id", delivery.id);
    }
  }

  return NextResponse.json({ slot: slot.key, newTenderCount: tenders.length, recipientCount: recipients.length, sent });
}
