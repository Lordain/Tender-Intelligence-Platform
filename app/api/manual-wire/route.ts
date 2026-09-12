import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { selectPreferredSubscription } from "@/lib/access-control";
import { PLAN_PRICES_USD } from "@/lib/billing-catalog";
import { internationalWireEnabled } from "@/lib/manual-wire";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

const profileSchema = z.object({
  plan: z.enum(["professional", "enterprise"]),
  interval: z.enum(["monthly", "semiannual", "annual"]),
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

const proofSchema = z.object({
  requestId: z.uuid(),
  senderName: z.string().trim().min(1).max(160),
  senderBank: z.string().trim().min(1).max(160),
  senderReference: z.string().trim().min(1).max(160),
  sentAt: z.iso.datetime(),
  customerNote: z.string().trim().max(1000).optional().default(""),
});

function makeReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `LTW-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function POST(request: Request) {
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请检查付款与账单资料。" }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin || !internationalWireEnabled()) return NextResponse.json({ error: "国际电汇暂未开放，请选择银行卡付款。" }, { status: 503 });

  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("status, created_at, current_period_start, current_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"]);
  if (subscriptionError) return NextResponse.json({ error: "暂时无法检查订阅状态。" }, { status: 500 });
  if (selectPreferredSubscription(subscriptionRows ?? []) || subscriptionRows?.some((row) => row.status === "past_due")) {
    return NextResponse.json({ error: "账户已有有效或待恢复的订阅，请先在账户页处理。", url: "/account" }, { status: 409 });
  }

  const { data: billingProfile, error: billingProfileError } = await admin
    .from("billing_profiles")
    .select("pending_payment_request_id, pending_payment_kind, pending_payment_url")
    .eq("user_id", user.id)
    .maybeSingle();
  if (billingProfileError) return NextResponse.json({ error: "暂时无法检查付款状态。" }, { status: 500 });
  if (billingProfile?.pending_payment_request_id && billingProfile.pending_payment_kind !== "international_wire") {
    return NextResponse.json({ error: "账户已有未完成的 Stripe 付款，请先在账户页处理。", url: "/account" }, { status: 409 });
  }

  const { data: existing, error: existingError } = await admin
    .from("manual_payment_requests")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["pending", "proof_submitted"])
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "暂时无法检查电汇申请。" }, { status: 500 });
  if (existing) return NextResponse.json({ url: "/account?wire=pending" });

  const amountMinor = Math.round(PLAN_PRICES_USD[parsed.data.plan][parsed.data.interval] * 100);
  const paymentId = parsed.data.requestId;
  const reference = makeReference();
  const now = new Date().toISOString();
  const { error: insertError } = await admin.from("manual_payment_requests").insert({
    id: paymentId,
    reference,
    user_id: user.id,
    plan: parsed.data.plan,
    billing_interval: parsed.data.interval,
    currency: "USD",
    amount_minor: amountMinor,
  });
  if (insertError) {
    console.error("[manual-wire] Request creation failed", insertError);
    return NextResponse.json({ error: "暂时无法创建国际电汇申请。" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("billing_profiles").upsert({
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
    pending_payment_request_id: paymentId,
    pending_payment_kind: "international_wire",
    pending_payment_reference_id: reference,
    pending_payment_url: "/account?wire=pending",
    pending_payment_expires_at: null,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (profileError) {
    await admin.from("manual_payment_requests").delete().eq("id", paymentId).eq("user_id", user.id);
    console.error("[manual-wire] Billing profile update failed", profileError);
    return NextResponse.json({ error: "暂时无法保存国际电汇申请。" }, { status: 500 });
  }

  return NextResponse.json({ url: "/account?wire=pending" });
}

export async function PATCH(request: Request) {
  const parsed = proofSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请完整填写汇款资料。" }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "账单服务暂未完成配置。" }, { status: 503 });

  const { data, error } = await admin.from("manual_payment_requests").update({
    status: "proof_submitted",
    sender_name: parsed.data.senderName,
    sender_bank: parsed.data.senderBank,
    sender_reference: parsed.data.senderReference,
    sent_at: parsed.data.sentAt,
    customer_note: parsed.data.customerNote || null,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.requestId).eq("user_id", user.id).eq("status", "pending").select("id");
  if (error) return NextResponse.json({ error: "暂时无法提交汇款资料。" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "该申请已提交或不再可编辑。" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
