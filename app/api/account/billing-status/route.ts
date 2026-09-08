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
      .select("pending_payment_kind, pending_payment_url, pending_payment_expires_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .not("stripe_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileResult.error || subscriptionResult.error) {
    console.error("[billing-status] Billing state lookup failed", profileResult.error ?? subscriptionResult.error);
    return NextResponse.json({ error: "暂时无法读取账单状态。" }, { status: 500 });
  }

  const profile = profileResult.data;
  const pendingPayment = profile?.pending_payment_kind && profile.pending_payment_url
    ? {
        kind: profile.pending_payment_kind as "card" | "bank_transfer",
        url: profile.pending_payment_url,
        expiresAt: profile.pending_payment_expires_at as string | null,
      }
    : null;

  let paymentCollection: "card" | "bank_transfer" | null = null;
  const subscriptionId = subscriptionResult.data?.stripe_subscription_id as string | null | undefined;
  const stripe = getStripeClient();
  if (subscriptionId && stripe) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const configuredCollection = subscription.metadata.payment_collection;
      if (configuredCollection === "card" || configuredCollection === "bank_transfer") {
        paymentCollection = configuredCollection;
      }
    } catch (error) {
      // The account page remains usable if Stripe is temporarily unavailable;
      // it simply falls back to payment-method-neutral renewal copy.
      console.error("[billing-status] Stripe subscription lookup failed", error);
    }
  }

  return NextResponse.json({ pendingPayment, paymentCollection });
}
