import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import type { BillingInterval } from "@/lib/access-control";
import type { PaidPlan } from "@/lib/billing-catalog";
import { sendSubscriptionRenewalReminder } from "@/lib/notifications/subscription-renewal-reminder";
import { getStripeClient, stripeSubscriptionPeriod } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = {
  id: string;
  user_id: string;
  plan: PaidPlan;
  billing_interval: BillingInterval;
  stripe_subscription_id: string;
  current_period_end: string;
};

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function reminderWindowEnd(now: Date): Date {
  // The daily job normally sends around seven to eight days before renewal.
  // A wider window also lets a delayed deployment/job still send a useful
  // notice. Durable delivery rows ensure only one email per billing period.
  return new Date(now.getTime() + 8 * DAY_MS);
}

function isAutomaticCardSubscription(subscription: Stripe.Subscription): boolean {
  return subscription.collection_method === "charge_automatically"
    && subscription.metadata.payment_collection !== "bank_transfer"
    && !subscription.cancel_at_period_end;
}

async function customerEmail(userId: string, invoice: Stripe.Invoice, admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  if (invoice.customer_email) return invoice.customer_email;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user?.email ?? null;
}

/**
 * Same source key and same once-per-incident rule as before; what changed
 * (2026-09-11) is that it now also emails WEBHOOK_ALERT_EMAILS. A row in
 * admin_alerts is only seen by someone who opens /admin, and a renewal
 * reminder that stops going out is not noticed by the customer either —
 * they find out when the charge lands.
 */
async function recordFailureAlert(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  candidate: Candidate,
  message: string,
) {
  await reportOpsFailure(admin, {
    source: `subscription-renewal-reminder:${candidate.stripe_subscription_id}`,
    title: "自动续费提醒发送失败",
    message: `${candidate.stripe_subscription_id}；${message}`,
  });
}

async function runReminders(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stripe = getStripeClient();
  const admin = createSupabaseAdminClient();
  if (!stripe || !admin) return NextResponse.json({ error: "Billing service is not configured" }, { status: 503 });

  const now = new Date();
  const windowEnd = reminderWindowEnd(now);
  const { data, error } = await admin
    .from("subscriptions")
    .select("id,user_id,plan,billing_interval,stripe_subscription_id,current_period_end")
    .eq("payment_source", "stripe")
    .in("status", ["active", "trialing"])
    .in("plan", ["professional", "enterprise"])
    .eq("cancel_at_period_end", false)
    .not("stripe_subscription_id", "is", null)
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", windowEnd.toISOString())
    .order("current_period_end", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of (data ?? []) as Candidate[]) {
    let deliveryId: string | null = null;
    try {
      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if (!isAutomaticCardSubscription(subscription)) {
        skipped += 1;
        continue;
      }
      const { periodEnd } = stripeSubscriptionPeriod(subscription);
      if (!periodEnd || new Date(periodEnd) <= now || new Date(periodEnd) > windowEnd) {
        skipped += 1;
        continue;
      }

      const { data: claimed, error: claimError } = await admin.rpc("claim_subscription_renewal_reminder", {
        p_subscription_id: row.id,
        p_user_id: row.user_id,
        p_period_end: periodEnd,
      });
      if (claimError) throw new Error(`Reminder claim failed: ${claimError.message}`);
      deliveryId = typeof claimed === "string" ? claimed : null;
      if (!deliveryId) {
        skipped += 1;
        continue;
      }

      const preview = await stripe.invoices.createPreview({ subscription: subscription.id });
      const email = await customerEmail(row.user_id, preview, admin);
      if (!email) throw new Error("Customer has no deliverable email address.");
      const resendId = await sendSubscriptionRenewalReminder({
        to: email,
        subscriptionId: subscription.id,
        plan: row.plan,
        interval: row.billing_interval,
        amountMinor: preview.amount_due,
        currency: preview.currency,
        periodEnd,
      });
      const { error: updateError } = await admin.from("subscription_renewal_reminders").update({
        status: "sent",
        resend_email_id: resendId,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", deliveryId);
      if (updateError) throw new Error(`Reminder delivery update failed: ${updateError.message}`);
      await admin.from("admin_alerts").update({ resolved_at: new Date().toISOString() })
        .eq("source", `subscription-renewal-reminder:${row.stripe_subscription_id}`)
        .is("resolved_at", null);
      sent += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      if (deliveryId) {
        await admin.from("subscription_renewal_reminders").update({
          status: "failed",
          error_message: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
      }
      await recordFailureAlert(admin, row, message);
      console.error(`[subscription-renewal-reminder] ${row.stripe_subscription_id} failed`, caught);
      failed += 1;
    }
  }

  await recordCronHeartbeat(admin, "subscription-renewal-reminders", failed > 0 ? "failed" : "ok", failed > 0 ? `${failed} 条提醒发送失败` : undefined);
  return NextResponse.json({ checked: data?.length ?? 0, sent, skipped, failed, windowEnd: windowEnd.toISOString() });
}

/**
 * A throw anywhere above — Supabase unreachable, Stripe's API down, a schema
 * change — used to surface only as a 500 in Vercel's log. Unattended work
 * that fails has to reach a person; see lib/notifications/ops-alert.ts.
 */
export async function GET(request: NextRequest) {
  try {
    return await runReminders(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const admin = createSupabaseAdminClient();
    await recordCronHeartbeat(admin, "subscription-renewal-reminders", "failed", message);
    await reportOpsFailure(admin, { source: "subscription-renewal-reminders:run", title: "续费提醒任务整体失败", message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
