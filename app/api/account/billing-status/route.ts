import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "账单服务暂未完成配置。" }, { status: 503 });

  const [profileResult, subscriptionResult] = await Promise.all([
    admin
      .from("billing_profiles")
      .select("pending_payment_request_id, pending_payment_kind, pending_payment_url, pending_payment_expires_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("stripe_subscription_id, payment_source")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileResult.error || subscriptionResult.error) {
    console.error("[billing-status] Billing state lookup failed", profileResult.error ?? subscriptionResult.error);
    return NextResponse.json({ error: "暂时无法读取账单状态。" }, { status: 500 });
  }

  const profile = profileResult.data;
  let pendingPayment = profile?.pending_payment_kind && profile.pending_payment_url
    ? {
        kind: profile.pending_payment_kind as "card" | "bank_transfer" | "international_wire",
        url: profile.pending_payment_url,
        expiresAt: profile.pending_payment_expires_at as string | null,
      }
    : null;

  let paymentCollection: "card" | "bank_transfer" | "international_wire" | null =
    subscriptionResult.data?.payment_source === "manual" ? "international_wire" : null;
  const subscriptionId = subscriptionResult.data?.stripe_subscription_id as string | null | undefined;
  const stripe = getStripeClient();
  if (subscriptionId && stripe) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
      const configuredCollection = subscription.metadata.payment_collection;
      if (configuredCollection === "card" || configuredCollection === "bank_transfer") {
        paymentCollection = configuredCollection;
      }

      // The checkout route stores the first Hosted Invoice URL in
      // billing_profiles, but Stripe creates renewal invoices on its own.
      // Those later URLs never pass through checkout, so discover the latest
      // open invoice directly from the authenticated user's subscription.
      // This also keeps an overdue transfer reachable while its invoice is
      // still open, without granting the browser access to arbitrary invoice
      // IDs or trusting a URL supplied by the client.
      if (configuredCollection === "bank_transfer") {
        const latestInvoice = typeof subscription.latest_invoice === "string"
          ? await stripe.invoices.retrieve(subscription.latest_invoice)
          : subscription.latest_invoice;
        if (latestInvoice?.status === "open" && latestInvoice.hosted_invoice_url) {
          pendingPayment = {
            kind: "bank_transfer",
            url: latestInvoice.hosted_invoice_url,
            expiresAt: latestInvoice.due_date
              ? new Date(latestInvoice.due_date * 1000).toISOString()
              : null,
          };
        }
      }
    } catch (error) {
      // The account page remains usable if Stripe is temporarily unavailable;
      // it simply falls back to payment-method-neutral renewal copy.
      console.error("[billing-status] Stripe subscription lookup failed", error);
    }
  }

  let manualWire = null;
  if (profile?.pending_payment_kind === "international_wire" && profile.pending_payment_request_id) {
    const { data: wireRequest, error: wireError } = await admin
      .from("manual_payment_requests")
      .select("id, reference, plan, billing_interval, currency, amount_minor, status, sender_name, sender_bank, sender_reference, sent_at, customer_note, created_at")
      .eq("id", profile.pending_payment_request_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (wireError) {
      console.error("[billing-status] Manual wire lookup failed", wireError);
      return NextResponse.json({ error: "暂时无法读取国际电汇状态。" }, { status: 500 });
    }
    if (wireRequest) manualWire = { request: wireRequest };
  }

  return NextResponse.json({ pendingPayment, paymentCollection, manualWire });
}
