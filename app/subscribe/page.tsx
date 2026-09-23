import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionCheckoutForm } from "@/components/pricing/SubscriptionCheckoutForm";
import { loginPathFor } from "@/lib/auth-redirect";
import { bankTransferQuote, parsePaidPlanSelection, PLAN_PRICES_USD } from "@/lib/billing-catalog";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { hasCurrentStripePrice } from "@/lib/stripe";
import { internationalWireEnabled } from "@/lib/manual-wire";

/**
 * The one crawlable page here that should NOT be indexed, rather than one that
 * needs a canonical.
 *
 * It redirects to /pricing without a valid plan and to /login without a
 * session, so a crawler can never see anything but a redirect. It is left out
 * of robots.ts's disallow list on purpose: blocking it in robots.txt would
 * stop Google reading this noindex, and a URL it already knows would sit in
 * the report forever. Blocked and noindex are not the same instruction.
 */
export const metadata: Metadata = {
  title: "确认订阅与付款",
  robots: { index: false, follow: false },
};

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const plan = typeof query.plan === "string" ? query.plan : null;
  const interval = typeof query.interval === "string" ? query.interval : null;
  const selected = parsePaidPlanSelection(plan, interval);
  if (!selected) redirect("/pricing");

  const user = await getCurrentUser();
  const returnPath = `/subscribe?plan=${selected.plan}&interval=${selected.interval}`;
  if (!user) redirect(loginPathFor(returnPath));

  const admin = createSupabaseAdminClient();
  const { data: profile } = admin
    ? await admin.from("billing_profiles").select("buyer_type, legal_name, billing_email, country, address_line1, address_line2, city, state, postal_code, tax_id").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const rate = Number(process.env.USD_MXN_BANK_TRANSFER_RATE);
  const validDays = Math.min(30, Math.max(1, Number(process.env.BANK_TRANSFER_DAYS_UNTIL_DUE) || 3));
  const quote = Number.isFinite(rate) && rate > 0 ? bankTransferQuote(selected.plan, rate) : null;
  const stripeReady = await hasCurrentStripePrice(selected.plan);

  return (
    <main className="bg-[#f6f4ef] px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 border-b border-[#d8e0e3] pb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Secure checkout</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[#071826]">确认订阅</h1>
          <p className="mt-4 text-sm font-bold text-[#425461]">{selected.plan === "basic" ? "基础个人版" : selected.plan === "professional" ? "专业个人版" : "专业企业版"} · ${PLAN_PRICES_USD[selected.plan].monthly} USD / 月</p>
        </header>
        <SubscriptionCheckoutForm
          plan={selected.plan}
          interval={selected.interval}
          usdAmount={PLAN_PRICES_USD[selected.plan].monthly}
          bankQuote={quote ? { mxnAmount: quote.mxnAmount, rate, validDays } : null}
          stripeReady={stripeReady}
          internationalWireEnabled={internationalWireEnabled()}
          initialProfile={{
            buyerType: profile?.buyer_type === "individual" ? "individual" : "business",
            legalName: profile?.legal_name ?? "",
            billingEmail: profile?.billing_email ?? user.email ?? "",
            country: profile?.country ?? "MX",
            addressLine1: profile?.address_line1 ?? "",
            addressLine2: profile?.address_line2 ?? "",
            city: profile?.city ?? "",
            state: profile?.state ?? "",
            postalCode: profile?.postal_code ?? "",
            taxId: profile?.tax_id ?? "",
          }}
        />
      </div>
    </main>
  );
}
