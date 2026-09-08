import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscriptionStatusFromStripe, type BillingInterval } from "@/lib/access-control";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import {
  getStripeClient,
  stripeObjectId,
  stripeSelectionFromPriceId,
  stripeSubscriptionPeriod,
  type StripePlan,
} from "@/lib/stripe";

export const runtime = "nodejs";

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  return stripeObjectId(invoice.parent?.subscription_details?.subscription ?? null);
}

function subscriptionIdentity(subscription: Stripe.Subscription, fallbackUserId?: string | null): {
  userId: string;
  plan: StripePlan;
  interval: BillingInterval;
} {
  const userId = subscription.metadata.user_id || fallbackUserId;
  if (!userId) throw new Error(`Stripe subscription ${subscription.id} is missing a valid user ID.`);

  // Price is the current billing truth. Metadata describes the original
  // Checkout selection and does not change when an operator switches a
  // subscription to another configured price in the Stripe Dashboard.
  const fromPrice = subscription.items.data
    .map((item) => stripeSelectionFromPriceId(item.price.id))
    .find((candidate) => candidate !== null);
  const metadataPlan = subscription.metadata.plan;
  const metadataInterval = subscription.metadata.billing_interval;
  let fromMetadata: { plan: StripePlan; interval: BillingInterval } | null = null;
  if (
    (metadataPlan === "professional" || metadataPlan === "enterprise") &&
    (metadataInterval === "monthly" || metadataInterval === "semiannual" || metadataInterval === "annual")
  ) {
    fromMetadata = { plan: metadataPlan, interval: metadataInterval };
  }
  const selection = fromPrice ?? fromMetadata;
  if (!selection) {
    const priceIds = subscription.items.data.map((item) => item.price.id).join(", ") || "none";
    throw new Error(`Stripe subscription ${subscription.id} has no configured price or valid plan metadata (${priceIds}).`);
  }
  if (!fromPrice) {
    console.warn(
      `[stripe-webhook] Subscription ${subscription.id} uses a legacy price; retaining plan and interval from Checkout metadata.`,
    );
  }
  return { userId, ...selection };
}

async function saveSubscription(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null,
) {
  const { userId, plan, interval } = subscriptionIdentity(subscription, fallbackUserId);
  const { periodStart, periodEnd } = stripeSubscriptionPeriod(subscription);
  const values = {
    user_id: userId,
    plan,
    status: subscriptionStatusFromStripe(subscription.status),
    billing_interval: interval,
    stripe_customer_id: stripeObjectId(subscription.customer),
    stripe_subscription_id: subscription.id,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
  };

  const { data: existing, error: readError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (readError) throw new Error(`Subscription lookup failed: ${readError.message}`);

  if (existing) {
    const { error } = await admin.from("subscriptions").update(values).eq("id", existing.id);
    if (error) throw new Error(`Subscription update failed: ${error.message}`);
    return;
  }

  const { error } = await admin.from("subscriptions").insert(values);
  if (!error) return;
  if (error.code === "23505") {
    const { data: updated, error: retryError } = await admin
      .from("subscriptions")
      .update(values)
      .eq("stripe_subscription_id", subscription.id)
      .select("id");
    if (retryError) throw new Error(`Subscription conflict update failed: ${retryError.message}`);
    if (updated && updated.length > 0) return;

    // 0027 has two unique indexes. A duplicate webhook delivery conflicts on
    // stripe_subscription_id and is safely handled by the update above. A
    // second live Stripe subscription for the same user conflicts on user_id,
    // however, so that update matches zero rows. Treating zero rows as success
    // would acknowledge the webhook while silently dropping a paid purchase.
    throw new Error(
      `Subscription insert conflicted for user ${userId}, but no existing row matched Stripe subscription ${subscription.id}.`,
    );
  }
  throw new Error(`Subscription insert failed: ${error.message}`);
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const admin = createSupabaseAdminClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !admin || !webhookSecret) {
    return NextResponse.json({ error: "Webhook service is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const subscriptionId = stripeObjectId(session.subscription);
      if (session.mode === "subscription" && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await saveSubscription(admin, subscription, session.client_reference_id);
      }
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const subscriptionId = subscriptionIdFromInvoice(event.data.object);
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await saveSubscription(admin, subscription);
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = await stripe.subscriptions.retrieve(event.data.object.id);
      await saveSubscription(admin, subscription);
    } else if (event.type === "customer.subscription.deleted") {
      await saveSubscription(admin, event.data.object);
    }
  } catch (error) {
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed`, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
