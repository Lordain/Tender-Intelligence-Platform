import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

function isMissingStripeResource(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "resource_missing",
  );
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) return NextResponse.json({ error: "支付服务暂未完成配置。" }, { status: 503 });

  const { data: pending, error: readError } = await admin
    .from("billing_profiles")
    .select("pending_payment_request_id, pending_payment_kind, pending_payment_reference_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("[pending-payment] Pending payment lookup failed", readError);
    return NextResponse.json({ error: "暂时无法读取待付款记录。" }, { status: 500 });
  }

  const requestId = pending?.pending_payment_request_id as string | null | undefined;
  const kind = pending?.pending_payment_kind as string | null | undefined;
  const referenceId = pending?.pending_payment_reference_id as string | null | undefined;
  if (!requestId) return NextResponse.json({ ok: true });
  if (kind !== "card" && kind !== "bank_transfer") {
    return NextResponse.json({ error: "这不是可在 Stripe 中取消的待付款记录。" }, { status: 409 });
  }

  try {
    if (referenceId && kind === "card") {
      const session = await stripe.checkout.sessions.retrieve(referenceId);
      if (session.client_reference_id !== user.id && session.metadata?.user_id !== user.id) {
        return NextResponse.json({ error: "待付款记录与当前账户不匹配。" }, { status: 403 });
      }
      if (session.status === "complete") {
        return NextResponse.json({ error: "这笔付款已经完成，不能取消。请刷新账户状态。" }, { status: 409 });
      }
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
    }

    if (referenceId && kind === "bank_transfer") {
      let subscription = await stripe.subscriptions.retrieve(referenceId, { expand: ["latest_invoice"] });
      if (subscription.metadata.user_id !== user.id) {
        return NextResponse.json({ error: "待付款记录与当前账户不匹配。" }, { status: 403 });
      }
      let invoice = typeof subscription.latest_invoice === "string"
        ? await stripe.invoices.retrieve(subscription.latest_invoice)
        : subscription.latest_invoice;
      if (invoice?.status === "paid" || (invoice?.amount_paid ?? 0) > 0) {
        return NextResponse.json({ error: "Stripe 已记录这笔转账到账，不能取消。请刷新账户状态。" }, { status: 409 });
      }

      if (subscription.status !== "canceled") {
        subscription = await stripe.subscriptions.cancel(subscription.id);
      }

      // Canceling the subscription normally closes its unpaid invoice. Read
      // it again before acting so a webhook or Stripe transition that happened
      // concurrently cannot turn a paid invoice into a void invoice here.
      if (invoice) invoice = await stripe.invoices.retrieve(invoice.id);
      if (invoice?.status === "paid" || (invoice?.amount_paid ?? 0) > 0) {
        console.error("[pending-payment] Invoice received funds while its subscription was being canceled", invoice?.id);
        return NextResponse.json({ error: "Stripe 已记录这笔转账到账，请联系客服核对订阅状态。" }, { status: 409 });
      }
      if (invoice?.status === "draft") invoice = await stripe.invoices.finalizeInvoice(invoice.id);
      if (invoice?.status === "open") await stripe.invoices.voidInvoice(invoice.id);
    }
  } catch (error) {
    // A stale local pointer to an object already removed in Stripe should not
    // trap the user forever. Any other provider error must leave the pointer
    // intact so the operation can be retried safely.
    if (!isMissingStripeResource(error)) {
      console.error("[pending-payment] Stripe cancellation failed", error);
      return NextResponse.json({ error: "Stripe 暂时无法关闭这笔待付款，请稍后重试。" }, { status: 502 });
    }
  }

  const { data: clearedRows, error: clearError } = await admin
    .from("billing_profiles")
    .update({
      pending_payment_request_id: null,
      pending_payment_kind: null,
      pending_payment_reference_id: null,
      pending_payment_url: null,
      pending_payment_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("pending_payment_request_id", requestId)
    .select("user_id");
  if (clearError) {
    console.error("[pending-payment] Pending payment clear failed", clearError);
    return NextResponse.json({ error: "Stripe 付款已关闭，但账户状态暂时无法更新，请刷新后重试。" }, { status: 500 });
  }

  // Another request may have replaced this one while Stripe was responding.
  // The request-id guard deliberately leaves that newer request untouched.
  return NextResponse.json({ ok: true, cleared: Boolean(clearedRows?.length) });
}
