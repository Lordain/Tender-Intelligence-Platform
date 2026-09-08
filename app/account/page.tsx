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
    kind: "card" | "bank_transfer";
    url: string;
    expiresAt: string | null;
  } | null;
  paymentCollection: "card" | "bank_transfer" | null;
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
  const [entitlementReloadKey, setEntitlementReloadKey] = useState(0);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

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

        {billingStatus?.pendingPayment && (
          <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-[#e9b949] bg-[#fff7df] px-5 py-5 text-[#5f4300] shadow-[0_16px_40px_-34px_rgba(95,67,0,.55)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
            <a href={billingStatus.pendingPayment.url} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#071826] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#12334a]">
              {billingStatus.pendingPayment.kind === "bank_transfer" ? "查看转账资料与状态" : "继续付款"}
            </a>
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
                {entitlement?.role === "trial" ? "7 天免费试用" : entitlement?.plan === "enterprise" ? "企业版" : entitlement?.role === "subscriber" ? "个人版" : localize(uiText.freePlan, locale)}
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
