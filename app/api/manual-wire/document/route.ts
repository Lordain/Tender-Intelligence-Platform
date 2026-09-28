import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin-auth";
import { invoiceSeller } from "@/lib/billing/invoice-seller";
import { buildProformaInvoicePdf, buildServiceAgreementPdf, WireDocumentTextError } from "@/lib/billing/wire-documents";
import { siteOrigin } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getCurrentUser } from "@/lib/supabase/server-client";

export const runtime = "nodejs";

const querySchema = z.object({
  requestId: z.uuid(),
  kind: z.enum(["invoice", "agreement"]),
});

function plain(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" } });
}

/**
 * The English proforma invoice or service agreement for one international
 * wire request (lib/billing/wire-documents.ts), for the customer who made it
 * or an admin. Built on each request; nothing is stored.
 */
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return plain("链接无效。", 400);
  const user = await getCurrentUser();
  if (!user) return plain("请先登录后再下载。", 401);
  const admin = createSupabaseAdminClient();
  const seller = invoiceSeller();
  if (!admin || !seller) return plain("形式发票暂未开放，请联系 billing 邮箱获取。", 503);

  const { data: payment, error } = await admin
    .from("manual_payment_requests")
    .select("id, reference, user_id, plan, billing_interval, currency, amount_minor, status, created_at")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (error) return plain("暂时无法读取电汇申请。", 500);
  const staff = isAdminEmail(user.email);
  // Someone else's request reads as missing, not forbidden.
  if (!payment || (payment.user_id !== user.id && !staff)) return plain("没有找到这个电汇申请。", 404);
  if (["cancelled", "rejected", "expired"].includes(payment.status)) return plain("这个电汇申请已取消，不再提供文件。", 410);
  if (payment.currency !== "USD" || (payment.billing_interval !== "monthly" && payment.billing_interval !== "annual")) {
    return plain("这个电汇申请不支持生成文件，请联系我们。", 409);
  }

  const [{ data: profile, error: profileError }, { data: owner, error: ownerError }] = await Promise.all([
    admin
      .from("billing_profiles")
      .select("legal_name, billing_email, country, address_line1, address_line2, city, state, postal_code, tax_id")
      .eq("user_id", payment.user_id)
      .maybeSingle(),
    admin.auth.admin.getUserById(payment.user_id),
  ]);
  if (profileError || ownerError || !profile) return plain("暂时无法读取账单资料。", 500);

  const input = {
    seller,
    siteOrigin: siteOrigin(),
    buyer: {
      legalName: profile.legal_name,
      addressLine1: profile.address_line1,
      addressLine2: profile.address_line2,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postal_code,
      country: profile.country,
      taxId: profile.tax_id,
      billingEmail: profile.billing_email,
    },
    order: {
      reference: payment.reference,
      plan: payment.plan,
      interval: payment.billing_interval,
      amountUsd: payment.amount_minor / 100,
      issuedAt: new Date(payment.created_at),
      accountEmail: owner.user?.email ?? profile.billing_email,
    },
  };

  let pdf: Uint8Array;
  try {
    pdf = parsed.data.kind === "invoice" ? await buildProformaInvoicePdf(input) : await buildServiceAgreementPdf(input);
  } catch (err) {
    // The billing profile was edited to Chinese after the request was made.
    if (err instanceof WireDocumentTextError) return plain("账单资料含有中文等字符，英文文件无法显示。请联系我们更新为英文公司名称和地址。", 422);
    console.error("[manual-wire-document] PDF build failed", err);
    return plain("暂时无法生成文件，请稍后重试。", 500);
  }

  const name = parsed.data.kind === "invoice" ? "Proforma-Invoice" : "Service-Agreement";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="LatinTender-${name}-${payment.reference}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
