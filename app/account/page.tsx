"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { useEntitlement } from "@/lib/use-entitlement";
import { BILLING_INTERVAL_LABELS } from "@/lib/access-control";
import { EnterpriseAccounts } from "@/components/account/EnterpriseAccounts";
import { PendingInvitations } from "@/components/account/PendingInvitations";
import { InvoiceContact } from "@/components/billing/InvoiceContact";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

type BillingStatus = {
  pendingPayment: {
    kind: "card" | "bank_transfer" | "international_wire";
    url: string;
    expiresAt: string | null;
  } | null;
  paymentCollection: "card" | "bank_transfer" | "international_wire" | null;
  manualWire: {
    contactedAt: string | null;
    request: {
      id: string;
      reference: string;
      plan: "professional" | "enterprise";
      billing_interval: "monthly" | "semiannual" | "annual";
      currency: "USD";
      amount_minor: number;
      status: "pending" | "proof_submitted";
      sender_name: string | null;
      sender_bank: string | null;
      sender_reference: string | null;
      sent_at: string | null;
      customer_note: string | null;
    };
  } | null;
};

export default function AccountPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const { user, loading } = useUser();
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmingAbandonPayment, setConfirmingAbandonPayment] = useState(false);
  const [abandoningPayment, setAbandoningPayment] = useState(false);
  const [abandonPaymentError, setAbandonPaymentError] = useState<string | null>(null);
  const [entitlementReloadKey, setEntitlementReloadKey] = useState(0);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [wireProof, setWireProof] = useState({ senderName: "", senderBank: "", senderReference: "", sentAt: "", customerNote: "" });
  const [wireSubmitting, setWireSubmitting] = useState(false);
  const [wireMessage, setWireMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || loading) return;
    if (!user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    supabase
      .from("profiles")
      .select("company_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setCompanyName(data?.company_name ?? ""));

  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/account/billing-status", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<BillingStatus> : null)
      .then((result) => setBillingStatus(result))
      .catch(() => setBillingStatus(null));
  }, [user, entitlementReloadKey]);

  const entitlement = useEntitlement(Boolean(user), entitlementReloadKey);
  const isBankTransfer = billingStatus?.paymentCollection === "bank_transfer";

  async function submitWireProof(event: FormEvent) {
    event.preventDefault();
    const requestId = billingStatus?.manualWire?.request.id;
    if (!requestId) return;
    setWireSubmitting(true);
    setWireMessage(null);
    try {
      const response = await fetch("/api/manual-wire", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...wireProof, requestId, sentAt: new Date(wireProof.sentAt).toISOString() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWireMessage(result.error ?? "暂时无法提交汇款资料。");
        return;
      }
      setWireMessage("汇款资料已提交，管理员将在核实足额到账后开通订阅。");
      setEntitlementReloadKey((key) => key + 1);
    } catch {
      setWireMessage("网络错误，请稍后重试。");
    } finally {
      setWireSubmitting(false);
    }
  }

  // Only the person who owns the subscription may cancel it; an enterprise
  // seat holder reads the owner's dates but has nothing to cancel.
  // hasBillingLink matters: with no billing agreement behind it there is no
  // renewal to stop, and offering to cancel one would just write a state that
  // says something untrue about what happens at the period end.
  const canCancel = Boolean(
    entitlement?.role === "subscriber" &&
    entitlement.subscriptionOwnerUserId === user?.id &&
    entitlement.periodEnd &&
    !entitlement.cancelAtPeriodEnd &&
    entitlement.hasBillingLink,
  );

  const formatPeriodDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : "待确认";

  // Confirmed in the page rather than through window.confirm(): the native
  // dialog renders the notice as unstyled plain text, and several browsers
  // and embedded webviews suppress it outright — there it returns false, so
  // the button would simply do nothing with no way to tell why.
  async function cancelSubscription() {
    if (!entitlement?.periodEnd) return;
    setCanceling(true);
    setCancelError(null);
    try {
      const response = await fetch("/api/account/subscription/cancel", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCancelError(result.error ?? "取消失败，请稍后重试。");
        return;
      }
      setConfirmingCancel(false);
      setEntitlementReloadKey((key) => key + 1);
    } catch {
      setCancelError("网络错误，请稍后重试。");
    } finally {
      setCanceling(false);
    }
  }

  async function abandonPendingPayment() {
    setAbandoningPayment(true);
    setAbandonPaymentError(null);
    try {
      const response = await fetch("/api/account/pending-payment", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAbandonPaymentError(result.error ?? "暂时无法关闭这笔待付款，请稍后重试。");
        return;
      }
      setConfirmingAbandonPayment(false);
      setEntitlementReloadKey((key) => key + 1);
    } catch {
      setAbandonPaymentError("网络错误，请稍后重试。");
    } finally {
      setAbandoningPayment(false);
    }
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const supabase = getSupabaseBrowserClient();
    // A profiles row always exists by now (created by the on-signup trigger),
    // so this is a plain update — RLS only grants update, not insert, on this table.
    // The error is checked (2026-09-06): supabase-js resolves rather than
    // throwing on a rejected write, so an RLS denial or a dropped
    // connection used to leave the user looking at "已保存" for a change
    // that never persisted.
    const { error } = await supabase.from("profiles").update({ company_name: companyName }).eq("id", user.id);

    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSaveError(null);
    setSaved(true);
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="text-sm text-zinc-500">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
    );
  }

  if (loading || !user) {
    return null;
  }

  return (
    <div className="flex-1 bg-[#f7f4ee]">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="border-b border-[#d8e0e3] pb-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Account center</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[#071826] sm:text-5xl">
            账户管理
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#64717c] sm:text-base">
            管理账户资料与订阅状态；邮件提醒请前往独立的通知设置页面。
          </p>
        </header>

        {billingStatus?.manualWire && (
          <section className="mt-8 rounded-3xl border border-[#d5dee2] bg-[#fffdf9] p-6 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">International wire · manual review</p>
                <h2 className="mt-2 text-xl font-black text-[#071826]">国际银行电汇待确认</h2>
                <p className="mt-2 text-sm leading-6 text-[#64717c]">应付 <strong className="text-[#071826]">US${(billingStatus.manualWire.request.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} 美元（USD）</strong>。请勿换算为墨西哥比索。</p>
              </div>
              <span className="w-fit rounded-full bg-[#fff0ca] px-3 py-1 text-xs font-black text-[#8a5700]">
                {billingStatus.manualWire.request.status === "proof_submitted"
                  ? "已提交，待核账"
                  : billingStatus.manualWire.contactedAt
                    ? "已联系，等待汇款"
                    : "等待工作人员联系"}
              </span>
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl bg-[#f1f3f2] p-5 text-sm leading-6 text-[#425461]">
                <div className="text-xs font-bold text-[#7a878f]">申请编号</div>
                <div className="mt-1 font-black text-[#071826]">{billingStatus.manualWire.request.reference}</div>
                <p className="mt-4">工作人员会先核对你的购买主体与账单资料，再通过账单邮箱与你联系并提供本次汇款所需的信息。</p>
                <p className="mt-3 font-bold text-[#071826]">网站不会展示或自动发送银行账号、SWIFT/BIC 或收款人地址。</p>
                <p className="mt-3 text-xs text-[#64717c]">如收到与申请金额、币种或收款主体不一致的信息，请暂停汇款并通过官网公布的联系方式复核。</p>
              </div>
              <div>
                <div className="rounded-2xl border border-[#e9b949] bg-[#fff7df] px-4 py-3 text-xs leading-5 text-[#6e510b]">汇款币种必须为 USD，并选择由汇款方承担全部手续费（OUR）。附言必须填写唯一付款编号；少于应付金额时不会开通。</div>
                {billingStatus.manualWire.request.status === "pending" && billingStatus.manualWire.contactedAt ? (
                  <form onSubmit={submitWireProof} className="mt-4 grid gap-3">
                    <input required maxLength={160} placeholder="汇款人 / 公司名称" value={wireProof.senderName} onChange={(event) => setWireProof((value) => ({ ...value, senderName: event.target.value }))} className="h-11 rounded-xl border border-[#d8e0e3] px-4 text-sm" />
                    <input required maxLength={160} placeholder="汇出银行" value={wireProof.senderBank} onChange={(event) => setWireProof((value) => ({ ...value, senderBank: event.target.value }))} className="h-11 rounded-xl border border-[#d8e0e3] px-4 text-sm" />
                    <input required maxLength={160} placeholder="银行交易编号 / SWIFT 参考号" value={wireProof.senderReference} onChange={(event) => setWireProof((value) => ({ ...value, senderReference: event.target.value }))} className="h-11 rounded-xl border border-[#d8e0e3] px-4 text-sm" />
                    <label className="grid gap-1 text-xs font-bold text-[#64717c]">汇款时间<input required type="datetime-local" value={wireProof.sentAt} onChange={(event) => setWireProof((value) => ({ ...value, sentAt: event.target.value }))} className="h-11 rounded-xl border border-[#d8e0e3] px-4 text-sm text-[#071826]" /></label>
                    <textarea maxLength={1000} rows={3} placeholder="备注（选填）" value={wireProof.customerNote} onChange={(event) => setWireProof((value) => ({ ...value, customerNote: event.target.value }))} className="rounded-xl border border-[#d8e0e3] px-4 py-3 text-sm" />
                    <button disabled={wireSubmitting} className="rounded-xl bg-[#071826] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{wireSubmitting ? "提交中…" : "我已汇款，提交核账资料"}</button>
                  </form>
                ) : billingStatus.manualWire.request.status === "pending" ? (
                  <p className="mt-4 rounded-xl bg-[#f1f3f2] px-4 py-4 text-sm font-bold leading-6 text-[#425461]">申请已收到。工作人员完成资料核对并通过账单邮箱发送本次汇款信息后，这里会开放汇款回执提交表单。</p>
                ) : <p className="mt-4 text-sm font-bold leading-6 text-emerald-700">已收到你的汇款资料。提交回执不会自动开通，管理员将以实际到账记录为准。</p>}
                {wireMessage && <p className="mt-3 text-xs font-bold leading-5 text-[#64717c]">{wireMessage}</p>}
              </div>
            </div>
          </section>
        )}

        {billingStatus?.pendingPayment && billingStatus.pendingPayment.kind !== "international_wire" && (
          <section className="mt-8 rounded-2xl border border-[#e9b949] bg-[#fff7df] px-5 py-5 text-[#5f4300] shadow-[0_16px_40px_-34px_rgba(95,67,0,.55)] sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black">
                {billingStatus.pendingPayment.kind === "bank_transfer" ? "银行转账待付款" : "银行卡付款尚未完成"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#80621b]">
                {billingStatus.pendingPayment.kind === "bank_transfer"
                  ? "可重新打开 Stripe 账单，查看 CLABE、转账参考编号和最新付款状态。"
                  : "可返回 Stripe 安全付款页面继续完成订阅。"}
              </p>
            </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <a href={billingStatus.pendingPayment.url} className="inline-flex items-center justify-center rounded-xl bg-[#071826] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#12334a]">
                  {billingStatus.pendingPayment.kind === "bank_transfer" ? "查看转账资料与状态" : "继续付款"}
                </a>
                {!confirmingAbandonPayment && (
                  <button type="button" onClick={() => { setConfirmingAbandonPayment(true); setAbandonPaymentError(null); }} className="rounded-xl border border-[#b98a25] px-5 py-3 text-sm font-black text-[#6d4c00] hover:bg-white/55">
                    放弃这笔待付款
                  </button>
                )}
              </div>
            </div>
            {confirmingAbandonPayment && (
              <div className="mt-5 rounded-xl border border-[#d8b45d] bg-white/55 px-4 py-4">
                <p className="text-sm font-black text-[#5f4300]">确认放弃这笔待付款？</p>
                <p className="mt-2 text-xs leading-5 text-[#80621b]">
                  {billingStatus.pendingPayment.kind === "bank_transfer"
                    ? "未付款的 Stripe 转账账单及对应订阅将关闭。若 Stripe 已记录任何到账金额，则无法取消。"
                    : "Stripe 安全付款页面将失效；未完成的付款不会扣款，也不会影响账户已有权限。"}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={abandonPendingPayment} disabled={abandoningPayment} className="rounded-lg bg-[#071826] px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                    {abandoningPayment ? "处理中…" : "确认放弃"}
                  </button>
                  <button type="button" onClick={() => { setConfirmingAbandonPayment(false); setAbandonPaymentError(null); }} disabled={abandoningPayment} className="rounded-lg border border-[#b98a25] px-4 py-2 text-xs font-bold text-[#6d4c00] disabled:opacity-50">
                    返回
                  </button>
                </div>
                {abandonPaymentError && <p className="mt-3 text-xs font-bold text-red-700">{abandonPaymentError}</p>}
              </div>
            )}
          </section>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-8">
            <div className="mb-7 flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0ca] text-[#a96100]" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2"><path d="M4 5h16v14H4z"/><path d="m4 7 8 6 8-6"/></svg>
              </div>
              <div>
                <h2 className="text-xl font-black text-[#071826]">账户资料</h2>
                <p className="mt-1 text-sm leading-6 text-[#6b7881]">用于账户识别和接收平台服务通知。</p>
              </div>
            </div>

            <div className="rounded-2xl bg-[#f1f3f2] px-4 py-3.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#849098]">{localize(uiText.emailLabel, locale)}</div>
              <div className="mt-1 break-all text-sm font-bold text-[#071826] sm:text-base">{user.email}</div>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-6 flex flex-col gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold text-[#425461]">
                  企业名称
                </span>
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => {
                    setCompanyName(event.target.value);
                    setSaved(false);
                    setSaveError(null);
                  }}
                  placeholder="填写企业或团队名称"
                  className="h-12 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm text-[#071826] placeholder:text-[#98a2a8] focus:border-[#ffb21c] focus:outline-none focus:ring-2 focus:ring-[#ffb21c]/15"
                />
              </label>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#ffb21c] px-5 py-3 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
                >
                  {saving ? "保存中…" : localize(uiText.saveProfile, locale)}
                </button>
                {saved && <span className="text-xs font-semibold text-emerald-600">{localize(uiText.profileSaved, locale)}</span>}
                {saveError && <span className="text-xs font-semibold text-red-600">保存失败：{saveError}</span>}
              </div>
            </form>
          </section>

          <section className="relative overflow-hidden rounded-3xl bg-[#061b2b] p-6 text-white shadow-[0_22px_60px_-45px_rgba(3,21,33,.85)] sm:p-8">
            <div className="absolute -right-16 -top-16 size-48 rounded-full bg-[#ffb21c]/12 blur-3xl" />
            <div className="relative flex h-full min-h-64 flex-col">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#ffb21c]">Subscription</div>
              <h2 className="mt-3 text-xl font-black">{localize(uiText.currentPlan, locale)}</h2>
              <div className="mt-5 rounded-2xl border border-white/12 bg-white/5 p-4 text-lg font-black">
                {entitlement?.role === "trial" ? "3 天免费试用" : entitlement?.plan === "enterprise" ? "企业版" : entitlement?.role === "subscriber" ? "个人版" : localize(uiText.freePlan, locale)}
              </div>
              {(entitlement?.periodStart || entitlement?.periodEnd) && (
                <dl className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-xs">
                  <div className="flex items-center justify-between gap-4 py-3"><dt className="text-white/48">开始时间</dt><dd className="font-bold text-white/85">{formatPeriodDate(entitlement.periodStart)}</dd></div>
                  <div className="flex items-center justify-between gap-4 py-3"><dt className="text-white/48">到期时间</dt><dd className="font-bold text-white/85">{formatPeriodDate(entitlement.periodEnd)}</dd></div>
                  {entitlement.billingInterval && (
                    <div className="flex items-center justify-between gap-4 py-3"><dt className="text-white/48">计费周期</dt><dd className="font-bold text-white/85">{BILLING_INTERVAL_LABELS[entitlement.billingInterval]}</dd></div>
                  )}
                </dl>
              )}
              <p className="mt-4 text-sm leading-6 text-white/55">
                {entitlement?.role === "trial" && entitlement.trialEndsAt
                  ? `试用有效期至 ${new Date(entitlement.trialEndsAt).toLocaleDateString("zh-CN")}；到期后自动转为免费版。`
                    : entitlement?.role === "free"
                      ? "免费试用已结束，订阅后可恢复项目详情与邮件通知。"
                    : entitlement?.role === "subscriber" && entitlement.hasBillingLink && !entitlement.cancelAtPeriodEnd && isBankTransfer
                      ? `将于 ${formatPeriodDate(entitlement.periodEnd)} 生成新的 MXN 转账账单，到账后续期。`
                    : entitlement?.role === "subscriber" && entitlement.hasBillingLink && !entitlement.cancelAtPeriodEnd
                      ? `将于 ${formatPeriodDate(entitlement.periodEnd)} 自动续期，可随时取消。`
                      : "查看可用套餐，管理项目与通知服务。"}
              </p>
              {entitlement?.cancelAtPeriodEnd && entitlement.periodEnd && (
                <div className="mt-5 rounded-xl border border-[#ffb21c]/35 bg-[#ffb21c]/10 px-4 py-3 text-xs font-bold leading-5 text-[#ffd16f]">{isBankTransfer ? "已取消续订" : "已取消自动续费"}。当前权限保留至 {formatPeriodDate(entitlement.periodEnd)}，到期后自动变为免费版。</div>
              )}
              {/* Said plainly rather than left to be inferred: nothing in this
                  codebase moves current_period_end forward, so a subscription
                  with no billing agreement behind it simply ends on that date.
                  This notice disappears on its own once checkout is connected
                  and rows carry a provider subscription id. */}
              {entitlement?.role === "subscriber" && !entitlement.hasBillingLink && !entitlement.cancelAtPeriodEnd && entitlement.periodEnd && (
                <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs font-bold leading-5 text-white/70">本次订阅有效期至 {formatPeriodDate(entitlement.periodEnd)}，尚未接入自动续期。到期后账户将转为免费版，需重新订阅。</div>
              )}
              {canCancel && confirmingCancel && (
                <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-4">
                  <p className="text-xs font-bold leading-5 text-white/85">确认取消{isBankTransfer ? "续订" : "自动续费"}？</p>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    当前订阅已付费至 <span className="font-bold text-white/85">{formatPeriodDate(entitlement?.periodEnd ?? null)}</span>，在那之前权限完全不变。
                    该日期<span className="font-bold text-white/85">当天到期后</span>账户自动转为免费版：项目详情需要重新订阅才能查看，邮件通知同时停止。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={cancelSubscription} disabled={canceling} className="rounded-lg bg-white/90 px-4 py-2 text-xs font-black text-[#061b2b] hover:bg-white disabled:opacity-50">
                      {canceling ? "处理中…" : "确认取消续费"}
                    </button>
                    <button type="button" onClick={() => { setConfirmingCancel(false); setCancelError(null); }} disabled={canceling} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold text-white/70 hover:text-white disabled:opacity-50">
                      保持订阅
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-7">
                <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-bold text-[#ffb21c] transition-colors hover:text-[#ffd16f]">
                  {localize(uiText.viewPlans, locale)} <span aria-hidden="true">→</span>
                </Link>
                {canCancel && !confirmingCancel && (
                  <button type="button" onClick={() => setConfirmingCancel(true)} className="text-xs font-bold text-white/52 underline decoration-white/25 underline-offset-4 hover:text-white">取消{isBankTransfer ? "续订" : "自动续费"}</button>
                )}
              </div>
              {cancelError && <p className="mt-3 text-xs font-bold text-red-300">{cancelError}</p>}
            </div>
          </section>
        </div>

        <div className="mt-6">
          <InvoiceContact accountEmail={user.email} compact />
        </div>

        {/* Every signed-in user, not just owners: this is where an invitee
            accepts or declines a seat someone offered them. */}
        <PendingInvitations />

        {entitlement?.isEnterpriseOwner && <EnterpriseAccounts />}

      </div>
    </div>
  );
}
