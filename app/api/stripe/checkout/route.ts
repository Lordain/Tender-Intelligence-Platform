import { NextResponse } from "next/server";
import { z } from "zod";
import { selectPreferredSubscription } from "@/lib/access-control";
import { loginPathFor } from "@/lib/auth-redirect";
import { bankTransferQuote, BILLING_MONTHS } from "@/lib/billing-catalog";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { appOrigin, getStripeClient, parseStripeSelection } from "@/lib/stripe";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.enum(["professional", "enterprise"]),
  interval: z.enum(["monthly", "semiannual", "annual"]),
  paymentMethod: z.enum(["card", "bank_transfer"]),
  quotedRate: z.number().positive().optional(),
  requestId: z.uuid(),
  buyerType: z.enum(["individual", "business"]),
  legalName: z.string().trim().min(1).max(160),
  billingEmail: z.email().max(254),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100),
  postalCode: z.string().trim().min(1).max(20),
  taxId: z.string().trim().max(40),
});

async function findBlockingSubscription(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, userId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, status, created_at, current_period_start, current_period_end, stripe_subscription_id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const preferred = selectPreferredSubscription(data ?? []);
  const pastDue = (data ?? []).find((row) => row.status === "past_due" && row.stripe_subscription_id);
  return preferred ?? pastDue ?? null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const selected = parseStripeSelection(requestUrl.searchParams.get("plan"), requestUrl.searchParams.get("interval"));
  if (!selected) return NextResponse.redirect(new URL("/pricing", requestUrl.origin), 303);
  const destination = `/subscribe?plan=${selected.plan}&interval=${selected.interval}`;
  const user = await getCurrentUser();
  return NextResponse.redirect(new URL(user ? destination : loginPathFor(destination), requestUrl.origin), 303);
}

export async function POST(request: Request) {
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请检查付款与账单资料。" }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });
  const stripe = getStripeClient();
  const admin = createSupabaseAdminClient();
  const selected = parseStripeSelection(parsed.data.plan, parsed.data.interval);
  if (!stripe || !admin || !selected) return NextResponse.json({ error: "支付服务暂未完成配置。" }, { status: 503 });

  const transferRate = Number(process.env.USD_MXN_BANK_TRANSFER_RATE);
  if (parsed.data.paymentMethod === "bank_transfer") {
    if (!Number.isFinite(transferRate) || transferRate <= 0) {
      return NextResponse.json({ error: "银行转账汇率尚未配置，请选择银行卡付款。" }, { status: 503 });
    }
    if (parsed.data.quotedRate !== transferRate) {
      return NextResponse.json({ error: "转账汇率已更新，请刷新页面确认新的 MXN 金额。" }, { status: 409 });
    }
  }

  let claimedPayment = false;

  try {
    if (await findBlockingSubscription(admin, user.id)) {
      return NextResponse.json({ error: "账户已有有效或待恢复的订阅，请先在账户页处理。", url: "/account" }, { status: 409 });
    }
    const { data: savedProfile, error: profileReadError } = await admin
      .from("billing_profiles")
      .select("stripe_customer_id, pending_payment_request_id, pending_payment_kind, pending_payment_url, pending_payment_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileReadError) throw new Error(profileReadError.message);
    if (savedProfile?.pending_payment_request_id) {
      const cardExpired =
        savedProfile.pending_payment_kind === "card" &&
        savedProfile.pending_payment_expires_at &&
        new Date(savedProfile.pending_payment_expires_at).getTime() <= Date.now();
      if (cardExpired) {
        const { error } = await admin
          .from("billing_profiles")
          .update({ pending_payment_request_id: null, pending_payment_kind: null, pending_payment_reference_id: null, pending_payment_url: null, pending_payment_expires_at: null })
          .eq("user_id", user.id)
          .eq("pending_payment_request_id", savedProfile.pending_payment_request_id);
        if (error) throw new Error(error.message);
      } else {
        if (savedProfile.pending_payment_url) return NextResponse.json({ url: savedProfile.pending_payment_url });
        return NextResponse.json({ error: "付款页面正在创建，请稍后再试。" }, { status: 409 });
      }
    }

    const { data: priorBilling, error: billingError } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (billingError) throw new Error(billingError.message);

    const customerData = {
      name: parsed.data.legalName,
      email: parsed.data.billingEmail,
      // Stripe uses the Customer locale for invoice emails and PDFs. The
      // Hosted Invoice Page itself still follows the visitor's browser
      // language, which Stripe intentionally prioritizes. Card Checkout is
      // explicitly shown in Chinese below.
      preferred_locales: parsed.data.paymentMethod === "bank_transfer" ? ["en" as const] : ["zh" as const],
      address: {
        line1: parsed.data.addressLine1,
        line2: parsed.data.addressLine2 || undefined,
        city: parsed.data.city,
        state: parsed.data.state || undefined,
        postal_code: parsed.data.postalCode,
        country: parsed.data.country,
      },
      metadata: { user_id: user.id, buyer_type: parsed.data.buyerType },
    };
    let customerId = savedProfile?.stripe_customer_id ?? priorBilling?.stripe_customer_id ?? null;
    if (customerId) await stripe.customers.update(customerId, customerData);
    else customerId = (await stripe.customers.create(customerData, { idempotencyKey: `customer-${user.id}` })).id;

    const { error: profileWriteError } = await admin.from("billing_profiles").upsert(
      {
        user_id: user.id,
        buyer_type: parsed.data.buyerType,
        legal_name: parsed.data.legalName,
        billing_email: parsed.data.billingEmail,
        country: parsed.data.country,
        address_line1: parsed.data.addressLine1,
        address_line2: parsed.data.addressLine2 || null,
        city: parsed.data.city,
        state: parsed.data.state || null,
        postal_code: parsed.data.postalCode,
        tax_id: parsed.data.taxId || null,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (profileWriteError) throw new Error(profileWriteError.message);

    const { data: claimedRows, error: claimError } = await admin
      .from("billing_profiles")
      .update({
        pending_payment_request_id: parsed.data.requestId,
        pending_payment_kind: parsed.data.paymentMethod,
        pending_payment_reference_id: null,
        pending_payment_url: null,
        pending_payment_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .is("pending_payment_request_id", null)
      .select("user_id");
    if (claimError) throw new Error(claimError.message);
    if (!claimedRows?.length) {
      const { data: currentPending } = await admin
        .from("billing_profiles")
        .select("pending_payment_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (currentPending?.pending_payment_url) return NextResponse.json({ url: currentPending.pending_payment_url });
      return NextResponse.json({ error: "付款页面正在创建，请稍后再试。" }, { status: 409 });
    }
    claimedPayment = true;

    const metadata = { user_id: user.id, plan: selected.plan, billing_interval: selected.interval, payment_collection: parsed.data.paymentMethod };
    if (parsed.data.paymentMethod === "card") {
      const origin = appOrigin(request);
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          locale: "zh",
          submit_type: "subscribe",
          customer: customerId,
          client_reference_id: user.id,
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
          line_items: [{ price: selected.priceId, quantity: 1 }],
          success_url: `${origin}/account?checkout=success`,
          cancel_url: `${origin}/subscribe?plan=${selected.plan}&interval=${selected.interval}`,
          metadata,
          subscription_data: { metadata },
          expires_at: expiresAt,
        },
        { idempotencyKey: `checkout-${user.id}-${parsed.data.requestId}` },
      );
      if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
      const { data: pendingRows, error: pendingError } = await admin
        .from("billing_profiles")
        .update({ pending_payment_reference_id: session.id, pending_payment_url: session.url, pending_payment_expires_at: new Date(expiresAt * 1000).toISOString() })
        .eq("user_id", user.id)
        .eq("pending_payment_request_id", parsed.data.requestId)
        .select("user_id");
      if (pendingError || !pendingRows?.length) {
        await stripe.checkout.sessions.expire(session.id);
        throw new Error(pendingError?.message ?? "Payment claim was lost before Checkout could be saved.");
      }
      return NextResponse.json({ url: session.url });
    }

    const validDays = Math.min(30, Math.max(1, Number(process.env.BANK_TRANSFER_DAYS_UNTIL_DUE) || 3));
    const quote = bankTransferQuote(selected.plan, selected.interval, transferRate);
    const price = await stripe.prices.retrieve(selected.priceId);
    const productId = typeof price.product === "string" ? price.product : price.product.id;

    // The bank-transfer amount is built from PLAN_PRICES_USD (lib/billing-
    // catalog.ts) because the browser has to render the quote before this
    // route runs. That makes the catalog a SECOND source of truth for
    // price, alongside the real Stripe Price the card flow charges — and a
    // price raised in the Stripe Dashboard would silently leave every bank
    // transfer billing the old amount forever, with nothing failing.
    //
    // So the two are reconciled here, the same posture as the quotedRate
    // check above: refuse the purchase rather than charge an amount that
    // disagrees with what the card flow would charge. Compared in USD cents
    // to avoid float noise. Only same-currency prices can be compared this
    // way; a Price that isn't USD means the catalog can't be validated at
    // all, which is equally worth stopping for.
    const expectedUsdCents = Math.round(quote.usdAmount * 100);
    if (price.currency !== "usd" || price.unit_amount !== expectedUsdCents) {
      throw new Error(
        `Bank-transfer quote disagrees with Stripe price ${selected.priceId}: catalog says ${expectedUsdCents} USD cents, Stripe says ${price.unit_amount} ${price.currency}. Update PLAN_PRICES_USD in lib/billing-catalog.ts to match before selling this plan by transfer.`,
      );
    }
    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: validDays,
        items: [{ price_data: { currency: "mxn", product: productId, unit_amount: quote.mxnAmountCentavos, recurring: { interval: "month", interval_count: BILLING_MONTHS[selected.interval] } }, quantity: 1 }],
        payment_settings: {
          payment_method_types: ["customer_balance"],
          payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } } },
        },
        metadata: { ...metadata, usd_amount: String(quote.usdAmount), usd_mxn_rate: String(transferRate) },
        expand: ["latest_invoice"],
      },
      { idempotencyKey: `bank-${user.id}-${parsed.data.requestId}` },
    );
    let invoice =
      typeof subscription.latest_invoice === "string"
        ? await stripe.invoices.retrieve(subscription.latest_invoice)
        : subscription.latest_invoice;
    if (!invoice) {
      await stripe.subscriptions.cancel(subscription.id);
      throw new Error("Stripe did not create an invoice for the bank-transfer subscription.");
    }

    try {
      // Stripe creates the first send_invoice subscription invoice as a
      // draft and normally finalizes it later. A draft deliberately has no
      // hosted_invoice_url, but this request needs a payment page to return
      // immediately, so finalize it explicitly before reading the URL.
      if (invoice.status === "draft") {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id);
      }
    } catch (error) {
      await stripe.subscriptions.cancel(subscription.id);
      throw error;
    }

    const invoiceUrl = invoice.hosted_invoice_url;
    if (!invoiceUrl) {
      if (invoice.status === "open") await stripe.invoices.voidInvoice(invoice.id);
      await stripe.subscriptions.cancel(subscription.id);
      throw new Error(`Stripe invoice ${invoice.id} has no hosted invoice URL after finalization.`);
    }
    const { data: pendingRows, error: pendingError } = await admin
      .from("billing_profiles")
      .update({ pending_payment_reference_id: subscription.id, pending_payment_url: invoiceUrl, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("pending_payment_request_id", parsed.data.requestId)
      .select("user_id");
    if (pendingError || !pendingRows?.length) {
      if (invoice?.status === "open") await stripe.invoices.voidInvoice(invoice.id);
      await stripe.subscriptions.cancel(subscription.id);
      throw new Error(pendingError?.message ?? "Payment claim was lost before the bank invoice could be saved.");
    }
    return NextResponse.json({ url: invoiceUrl });
  } catch (error) {
    if (claimedPayment) {
      await admin
        .from("billing_profiles")
        .update({ pending_payment_request_id: null, pending_payment_kind: null, pending_payment_reference_id: null, pending_payment_url: null, pending_payment_expires_at: null })
        .eq("user_id", user.id)
        .eq("pending_payment_request_id", parsed.data.requestId);
    }
    console.error("[stripe-checkout] Payment creation failed", error);
    return NextResponse.json({ error: "暂时无法创建 Stripe 付款页面，请稍后重试。" }, { status: 502 });
  }
}
