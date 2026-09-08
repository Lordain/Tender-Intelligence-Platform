import { NextResponse } from "next/server";
import { selectPreferredSubscription } from "@/lib/access-control";
import { loginPathFor } from "@/lib/auth-redirect";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { appOrigin, getStripeClient, parseStripeSelection } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const selected = parseStripeSelection(requestUrl.searchParams.get("plan"), requestUrl.searchParams.get("interval"));
  if (!selected) {
    return NextResponse.json({ error: "套餐、计费周期或 Stripe Price 配置无效。" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    const checkoutPath = `${requestUrl.pathname}${requestUrl.search}`;
    return NextResponse.redirect(new URL(loginPathFor(checkoutPath), requestUrl.origin), 303);
  }

  const stripe = getStripeClient();
  const admin = createSupabaseAdminClient();
  if (!stripe || !admin) {
    return NextResponse.json({ error: "支付服务暂未完成配置。" }, { status: 503 });
  }

  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("id, status, created_at, current_period_start, current_period_end, stripe_subscription_id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false });
  if (subscriptionError) return NextResponse.json({ error: subscriptionError.message }, { status: 500 });

  const liveSubscription = selectPreferredSubscription(subscriptionRows ?? []);
  if (liveSubscription) {
    return NextResponse.redirect(new URL("/account", appOrigin(request)), 303);
  }

  // A past-due Stripe agreement can still recover during Stripe's retry
  // schedule. Starting another Checkout while it exists can charge the user
  // twice and later make both subscriptions active. Payment recovery must
  // happen through the existing agreement (the Stripe email/account flow).
  const unresolvedPastDue = (subscriptionRows ?? []).find(
    (subscription) => subscription.status === "past_due" && subscription.stripe_subscription_id,
  );
  if (unresolvedPastDue) {
    return NextResponse.redirect(new URL("/account?billing=past_due", appOrigin(request)), 303);
  }

  const staleLiveSubscription = (subscriptionRows ?? []).find(
    (subscription) => subscription.status === "active" || subscription.status === "trialing",
  );
  if (staleLiveSubscription) {
    const { error: closeError } = await admin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", staleLiveSubscription.id);
    if (closeError) return NextResponse.json({ error: closeError.message }, { status: 500 });
  }

  const { data: priorBilling, error: billingError } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (billingError) return NextResponse.json({ error: billingError.message }, { status: 500 });

  const customerId = priorBilling?.stripe_customer_id as string | null | undefined;

  try {
    const origin = appOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      locale: "zh",
      submit_type: "subscribe",
      ...(customerId ? { customer: customerId } : { customer_email: user.email }),
      client_reference_id: user.id,
      line_items: [{ price: selected.priceId, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled&plan=${selected.plan}&interval=${selected.interval}`,
      metadata: { user_id: user.id, plan: selected.plan, billing_interval: selected.interval },
      subscription_data: {
        metadata: { user_id: user.id, plan: selected.plan, billing_interval: selected.interval },
      },
    });

    if (!session.url) return NextResponse.json({ error: "Stripe 未返回支付页面。" }, { status: 502 });
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("[stripe-checkout] Session creation failed", error);
    return NextResponse.json({ error: "暂时无法打开 Stripe 支付页面，请稍后重试。" }, { status: 502 });
  }
}
