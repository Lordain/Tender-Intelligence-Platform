import { NextResponse } from "next/server";
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

  const { data: liveSubscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .maybeSingle();
  if (subscriptionError) return NextResponse.json({ error: subscriptionError.message }, { status: 500 });

  if (liveSubscription) {
    const stillCurrent = !liveSubscription.current_period_end || new Date(liveSubscription.current_period_end).getTime() >= Date.now();
    if (stillCurrent) return NextResponse.redirect(new URL("/account", appOrigin(request)), 303);

    const { error: closeError } = await admin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", liveSubscription.id);
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
