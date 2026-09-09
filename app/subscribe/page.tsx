import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionCheckoutForm } from "@/components/pricing/SubscriptionCheckoutForm";
import { loginPathFor } from "@/lib/auth-redirect";
import { bankTransferQuote, PLAN_PRICES_USD } from "@/lib/billing-catalog";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { parseStripeSelection } from "@/lib/stripe";
import { internationalWireEnabled } from "@/lib/manual-wire";

export const metadata: Metadata = { title: "确认订阅与付款" };

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const plan = typeof query.plan === "string" ? query.plan : null;
  const interval = typeof query.interval === "string" ? query.interval : null;
  const selected = parseStripeSelection(plan, interval);
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
  const quote = Number.isFinite(rate) && rate > 0 ? bankTransferQuote(selected.plan, selected.interval, rate) : null;

  return (
    <main className="bg-[#f6f4ef] px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 border-b border-[#d8e0e3] pb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Secure checkout</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[#071826]">确认订阅</h1>
        </header>
        <SubscriptionCheckoutForm
          plan={selected.plan}
          interval={selected.interval}
          usdAmount={PLAN_PRICES_USD[selected.plan][selected.interval]}
          bankQuote={quote ? { mxnAmount: quote.mxnAmount, rate, validDays } : null}
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
