"use client";

import { useState, type FormEvent } from "react";
import { BILLING_INTERVAL_LABELS, type BillingInterval } from "@/lib/access-control";
import { PLAN_NAMES, type PaidPlan } from "@/lib/billing-catalog";

type BillingProfile = {
  buyerType: "individual" | "business";
  legalName: string;
  billingEmail: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  taxId: string;
};

type Props = {
  plan: PaidPlan;
  interval: BillingInterval;
  usdAmount: number;
  bankQuote: { mxnAmount: number; rate: number; validDays: number } | null;
  internationalWireEnabled: boolean;
  initialProfile: BillingProfile;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const mxn = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SubscriptionCheckoutForm({ plan, interval, usdAmount, bankQuote, internationalWireEnabled, initialProfile }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [method, setMethod] = useState<"card" | "bank_transfer" | "international_wire">("card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof BillingProfile>(key: K, value: BillingProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(method === "international_wire" ? "/api/manual-wire" : "/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          paymentMethod: method,
          quotedRate: method === "bank_transfer" ? bankQuote?.rate : undefined,
          requestId: crypto.randomUUID(),
          ...profile,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        setError(result.error ?? "暂时无法创建付款页面，请稍后重试。");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("网络错误，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "h-12 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm text-[#071826] placeholder:text-[#98a2a8] focus:border-[#ffb21c] focus:outline-none focus:ring-2 focus:ring-[#ffb21c]/15";

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
        <h2 className="text-xl font-black text-[#071826]">付款与账单资料</h2>
        <p className="mt-2 text-sm leading-6 text-[#64717c]">这些资料用于确认客户所在地和准备付款记录；如需 CFDI，付款后再通过 WhatsApp 提交完整开票资料。</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold text-[#425461]">购买者类型</span>
            <select value={profile.buyerType} onChange={(event) => update("buyerType", event.target.value as BillingProfile["buyerType"])} className={inputClass}>
              <option value="business">企业</option>
              <option value="individual">个人</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold text-[#425461]">法定姓名 / 公司名称</span>
            <input required maxLength={160} value={profile.legalName} onChange={(event) => update("legalName", event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold text-[#425461]">账单邮箱</span>
            <input required type="email" maxLength={254} value={profile.billingEmail} onChange={(event) => update("billingEmail", event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold text-[#425461]">国家或地区（两位代码）</span>
            <input required minLength={2} maxLength={2} placeholder="MX / CN / US" value={profile.country} onChange={(event) => update("country", event.target.value.toUpperCase())} className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs font-bold text-[#425461]">账单地址</span>
            <input required maxLength={200} value={profile.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs font-bold text-[#425461]">地址补充（选填）</span>
            <input maxLength={200} value={profile.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-2"><span className="text-xs font-bold text-[#425461]">城市</span><input required maxLength={100} value={profile.city} onChange={(event) => update("city", event.target.value)} className={inputClass} /></label>
          <label className="flex flex-col gap-2"><span className="text-xs font-bold text-[#425461]">州 / 省（选填）</span><input maxLength={100} value={profile.state} onChange={(event) => update("state", event.target.value)} className={inputClass} /></label>
          <label className="flex flex-col gap-2"><span className="text-xs font-bold text-[#425461]">邮政编码</span><input required maxLength={20} value={profile.postalCode} onChange={(event) => update("postalCode", event.target.value)} className={inputClass} /></label>
          <label className="flex flex-col gap-2"><span className="text-xs font-bold text-[#425461]">RFC / 境外税号（选填）</span><input maxLength={40} value={profile.taxId} onChange={(event) => update("taxId", event.target.value.toUpperCase())} className={inputClass} /></label>
        </div>
      </section>

      <aside className="h-fit rounded-3xl bg-[#061b2b] p-6 text-white sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffb21c]">确认订阅</p>
        <h2 className="mt-3 text-2xl font-black">{PLAN_NAMES[plan]} · {BILLING_INTERVAL_LABELS[interval]}</h2>
        <p className="mt-3 text-3xl font-black">{usd.format(usdAmount)}</p>
        <p className="mt-1 text-xs leading-5 text-white/55">美元标价，已包含依法适用的税费。</p>

        <fieldset className="mt-7 space-y-3">
          <legend className="mb-3 text-xs font-bold text-white/65">选择付款方式</legend>
          <label className={`block cursor-pointer rounded-2xl border p-4 ${method === "card" ? "border-[#ffb21c] bg-[#ffb21c]/10" : "border-white/15"}`}>
            <input type="radio" name="payment-method" value="card" checked={method === "card"} onChange={() => setMethod("card")} className="mr-3" />
            <span className="text-sm font-black">信用卡 / 借记卡</span>
            <span className="mt-1 block pl-6 text-xs leading-5 text-white/55">Stripe安全结账，以USD付款并自动续费。</span>
          </label>
          <label className={`block rounded-2xl border p-4 ${bankQuote ? "cursor-pointer" : "cursor-not-allowed opacity-55"} ${method === "bank_transfer" ? "border-[#ffb21c] bg-[#ffb21c]/10" : "border-white/15"}`}>
            <input type="radio" name="payment-method" value="bank_transfer" disabled={!bankQuote} checked={method === "bank_transfer"} onChange={() => setMethod("bank_transfer")} className="mr-3" />
            <span className="text-sm font-black">SPEI 银行转账（仅限墨西哥境内银行）</span>
            {bankQuote ? (
              <span className="mt-2 block pl-6 text-xs leading-5 text-white/65">
                应付 {mxn.format(bankQuote.mxnAmount)} 墨西哥比索（MXN）。请从墨西哥银行账户通过 SPEI 转账；境外客户请使用银行卡付款。参考汇率 1 USD = {bankQuote.rate.toFixed(2)} MXN，Stripe账单生成后金额锁定 {bankQuote.validDays} 天。
              </span>
            ) : (
              <span className="mt-1 block pl-6 text-xs leading-5 text-white/55">上线前配置当期USD/MXN转账汇率后开放。</span>
            )}
          </label>
          <label className={`block rounded-2xl border p-4 ${internationalWireEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-55"} ${method === "international_wire" ? "border-[#ffb21c] bg-[#ffb21c]/10" : "border-white/15"}`}>
            <input type="radio" name="payment-method" value="international_wire" disabled={!internationalWireEnabled} checked={method === "international_wire"} onChange={() => setMethod("international_wire")} className="mr-3" />
            <span className="text-sm font-black">国际银行电汇（人工确认）</span>
            <span className="mt-1 block pl-6 text-xs leading-5 text-white/55">
              {internationalWireEnabled
                ? `境外企业以美元（USD）汇款，金额 ${usd.format(usdAmount)}。到账核实后人工开通，不会自动续费。`
                : "收款账户审核完成后开放。"}
            </span>
          </label>
        </fieldset>

        {method === "bank_transfer" && <p className="mt-4 rounded-xl border border-[#ffb21c]/25 bg-[#ffb21c]/10 px-4 py-3 text-xs leading-5 text-[#ffd16f]">转账不是自动扣款。每个续费周期Stripe会发送新的MXN账单和转账指示，到账后才延长账户权限。</p>}
        {method === "international_wire" && <p className="mt-4 rounded-xl border border-[#ffb21c]/25 bg-[#ffb21c]/10 px-4 py-3 text-xs leading-5 text-[#ffd16f]">请使用申请页显示的唯一附言编号，并选择由汇款方承担全部中间行费用（OUR）。提交回执不代表到账，管理员核实足额入账后才会开通。</p>}
        {error && <p className="mt-4 text-xs font-bold leading-5 text-red-300">{error}</p>}
        <button disabled={submitting} type="submit" className="mt-6 w-full rounded-xl bg-[#ffb21c] px-5 py-3.5 text-sm font-black text-[#071826] hover:bg-[#ffc247] disabled:opacity-50">
          {submitting ? "正在创建付款申请…" : method === "international_wire" ? "生成国际电汇申请" : method === "bank_transfer" ? "生成 Stripe 转账账单" : "前往 Stripe 安全付款"}
        </button>
      </aside>
    </form>
  );
}
