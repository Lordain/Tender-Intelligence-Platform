import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { getStripeClient, stripeSubscriptionPeriod } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "订阅服务暂不可用。" }, { status: 503 });

  const { data: subscription, error: readError } = await admin.from("subscriptions")
    .select("id, current_period_end, cancel_at_period_end, stripe_subscription_id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!subscription) return NextResponse.json({ error: "没有可取消的有效订阅。" }, { status: 404 });
  if (!subscription.current_period_end) return NextResponse.json({ error: "当前订阅缺少到期时间，请联系客服处理取消。" }, { status: 409 });
  if (subscription.cancel_at_period_end) return NextResponse.json({ effectiveAt: subscription.current_period_end, alreadyScheduled: true });
  if (!subscription.stripe_subscription_id) return NextResponse.json({ error: "当前订阅没有关联 Stripe 自动续费。" }, { status: 409 });

  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe 支付服务暂不可用。" }, { status: 503 });

  let stripeSubscription;
  try {
    stripeSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, { cancel_at_period_end: true });
  } catch (error) {
    console.error("[stripe-cancel] Stripe update failed", error);
    return NextResponse.json({ error: "Stripe 暂时无法取消自动续费，请稍后重试。" }, { status: 502 });
  }

  const { periodStart, periodEnd } = stripeSubscriptionPeriod(stripeSubscription);

  const { error } = await admin.from("subscriptions").update({
    cancel_at_period_end: true,
    canceled_at: new Date().toISOString(),
    current_period_start: periodStart,
    current_period_end: periodEnd ?? subscription.current_period_end,
  }).eq("id", subscription.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ effectiveAt: periodEnd ?? subscription.current_period_end });
}
