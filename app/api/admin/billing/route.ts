import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), requestId: z.uuid(), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("contacted"), requestId: z.uuid(), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("reject"), requestId: z.uuid(), note: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("activate"), email: z.email(), plan: z.enum(["professional", "enterprise"]), interval: z.enum(["monthly", "semiannual", "annual"]), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.enum(["cancel_now", "cancel_period_end", "resume", "extend", "undo_extend"]), subscriptionId: z.uuid(), note: z.string().trim().max(1000).optional() }),
]);

async function userDirectory(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const users = new Map<string, string>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) users.set(user.id, user.email ?? user.id);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function findUserByEmail(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function GET() {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "数据库服务未配置。" }, { status: 503 });

  const [requestResult, subscriptionResult, auditResult, users] = await Promise.all([
    admin.from("manual_payment_requests").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("subscriptions").select("id, user_id, plan, status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, payment_source, stripe_subscription_id, created_at").order("created_at", { ascending: false }).limit(300),
    admin.from("billing_admin_audit_log").select("id, admin_user_id, target_user_id, manual_payment_request_id, subscription_id, action, note, details, created_at").order("created_at", { ascending: false }).limit(100),
    userDirectory(admin),
  ]);
  const error = requestResult.error ?? subscriptionResult.error ?? auditResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const attachEmail = <T extends { user_id?: string; target_user_id?: string; admin_user_id?: string }>(row: T) => ({
    ...row,
    email: users.get(row.user_id ?? row.target_user_id ?? "") ?? "未知账号",
    adminEmail: row.admin_user_id ? users.get(row.admin_user_id) ?? "未知管理员" : null,
  });
  return NextResponse.json({
    requests: (requestResult.data ?? []).map(attachEmail),
    subscriptions: (subscriptionResult.data ?? []).map(attachEmail),
    audit: (auditResult.data ?? []).map(attachEmail),
  });
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "操作参数无效。" }, { status: 400 });
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ error: "无管理员权限。" }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "数据库服务未配置。" }, { status: 503 });
  const input = parsed.data;

  try {
    if (input.action === "approve") {
      const { error } = await admin.rpc("approve_manual_payment", { p_request_id: input.requestId, p_admin_user_id: adminUser.id, p_note: input.note ?? null });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (input.action === "contacted") {
      const { data: payment, error: readError } = await admin.from("manual_payment_requests").select("user_id, reference, status").eq("id", input.requestId).maybeSingle();
      if (readError) throw readError;
      if (!payment || !["pending", "proof_submitted"].includes(payment.status)) return NextResponse.json({ error: "该申请已处理或不存在。" }, { status: 409 });
      const { data: priorContact, error: priorContactError } = await admin
        .from("billing_admin_audit_log")
        .select("id")
        .eq("manual_payment_request_id", input.requestId)
        .eq("action", "manual_payment_customer_contacted")
        .limit(1)
        .maybeSingle();
      if (priorContactError) throw priorContactError;
      if (priorContact) return NextResponse.json({ ok: true });
      const { error } = await admin.from("billing_admin_audit_log").insert({ admin_user_id: adminUser.id, target_user_id: payment.user_id, manual_payment_request_id: input.requestId, action: "manual_payment_customer_contacted", note: input.note ?? null, details: { reference: payment.reference } });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (input.action === "reject") {
      const { error } = await admin.rpc("reject_manual_payment", { p_request_id: input.requestId, p_admin_user_id: adminUser.id, p_note: input.note });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (input.action === "activate") {
      const target = await findUserByEmail(admin, input.email);
      if (!target) return NextResponse.json({ error: "找不到该邮箱对应的账号。" }, { status: 404 });
      const { error } = await admin.rpc("activate_manual_subscription", { p_user_id: target.id, p_plan: input.plan, p_billing_interval: input.interval, p_admin_user_id: adminUser.id, p_note: input.note ?? null });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const { data: subscription, error: readError } = await admin.from("subscriptions").select("*").eq("id", input.subscriptionId).maybeSingle();
    if (readError) throw readError;
    if (!subscription) return NextResponse.json({ error: "订阅不存在。" }, { status: 404 });
    if (subscription.stripe_subscription_id) return NextResponse.json({ error: "Stripe 订阅必须在 Stripe 中管理。" }, { status: 409 });
    if (input.action === "undo_extend") {
      const { error } = await admin.rpc("undo_manual_subscription_extension", { p_subscription_id: subscription.id, p_admin_user_id: adminUser.id, p_note: input.note ?? null });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const { error } = await admin.rpc("manage_manual_subscription", { p_subscription_id: subscription.id, p_action: input.action, p_admin_user_id: adminUser.id, p_note: input.note ?? null });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin-billing] Operation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败。" }, { status: 500 });
  }
}
