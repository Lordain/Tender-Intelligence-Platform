"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BILLING_INTERVAL_LABELS, type BillingInterval } from "@/lib/access-control";
import { PLAN_NAMES, type PaidPlan } from "@/lib/billing-catalog";

type PaymentRequest = {
  id: string; reference: string; email: string; plan: PaidPlan; billing_interval: BillingInterval;
  currency: "USD"; amount_minor: number; status: string; sender_name: string | null;
  sender_bank: string | null; sender_reference: string | null; sent_at: string | null;
  customer_note: string | null; created_at: string; review_note: string | null;
};
type Subscription = {
  id: string; email: string; plan: PaidPlan; status: string; billing_interval: BillingInterval;
  current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean;
  payment_source: "stripe" | "manual"; stripe_subscription_id: string | null;
};
type Audit = { id: string; email: string; adminEmail: string | null; action: string; note: string | null; created_at: string };
type Data = { requests: PaymentRequest[]; subscriptions: Subscription[]; audit: Audit[] };

const statusNames: Record<string, string> = { pending: "等待汇款", proof_submitted: "待核账", paid: "已到账", rejected: "已拒绝", expired: "已过期", cancelled: "已取消", active: "有效", trialing: "试用", past_due: "逾期" };
const inputClass = "h-11 rounded-xl border border-[#d4dde1] bg-white px-3 text-sm text-[#071826]";

export function AdminBillingPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmingStop, setConfirmingStop] = useState<string | null>(null);
  const [activation, setActivation] = useState<{ email: string; plan: PaidPlan; interval: BillingInterval; note: string }>({ email: "", plan: "professional", interval: "monthly", note: "" });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/billing", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "无法读取账单后台。");
    setData(result);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((cause) => setError(cause.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = useCallback(async (payload: Record<string, unknown>, key: string) => {
    setBusy(key); setError(null);
    try {
      const response = await fetch("/api/admin/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "操作失败。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败。"); }
    finally { setBusy(null); }
  }, [load]);

  const needle = query.trim().toLowerCase();
  const requests = useMemo(() => (data?.requests ?? []).filter((item) => !needle || `${item.email} ${item.reference} ${item.sender_reference ?? ""}`.toLowerCase().includes(needle)), [data, needle]);
  const subscriptions = useMemo(() => (data?.subscriptions ?? []).filter((item) => !needle || item.email.toLowerCase().includes(needle)), [data, needle]);

  function activate(event: FormEvent) {
    event.preventDefault();
    void run({ action: "activate", ...activation }, "activate");
  }

  return (
    <main className="mx-auto max-w-[94rem] px-5 py-8 sm:px-8">
      <AdminPageHeader eyebrow="Billing operations" title="收款与订阅" description="人工电汇只有在核实足额到账后才能开通。Stripe 订阅仍由 Stripe 管理。" />
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <section className="mt-6 rounded-2xl border border-[#dbe2e5] bg-white p-5">
        <h2 className="text-lg font-black text-[#071826]">人工开通订阅</h2>
        <p className="mt-1 text-xs leading-5 text-[#64717c]">用于线下已确认收款、赠送或补偿。若账号已有 Stripe 订阅，系统会拒绝操作。</p>
        <form onSubmit={activate} className="mt-4 grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_10rem_10rem_minmax(12rem,1fr)_auto]">
          <input required type="email" placeholder="客户登录邮箱" value={activation.email} onChange={(event) => setActivation((value) => ({ ...value, email: event.target.value }))} className={inputClass} />
          <select value={activation.plan} onChange={(event) => setActivation((value) => ({ ...value, plan: event.target.value as PaidPlan }))} className={inputClass}><option value="professional">个人版</option><option value="enterprise">企业版</option></select>
          <select value={activation.interval} onChange={(event) => setActivation((value) => ({ ...value, interval: event.target.value as BillingInterval }))} className={inputClass}><option value="monthly">按月</option><option value="semiannual">半年</option><option value="annual">年度</option></select>
          <input maxLength={1000} placeholder="原因 / 到账凭证编号" value={activation.note} onChange={(event) => setActivation((value) => ({ ...value, note: event.target.value }))} className={inputClass} />
          <button disabled={busy !== null} className="rounded-xl bg-[#071826] px-5 text-sm font-black text-white disabled:opacity-50">开通</button>
        </form>
      </section>

      <div className="mt-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-black text-[#071826]">国际电汇申请</h2>
        <input placeholder="搜索邮箱、附言或交易号" value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} w-full max-w-sm`} />
      </div>
      <div className="mt-3 grid gap-4">
        {requests.map((item) => (
          <article key={item.id} className="rounded-2xl border border-[#dbe2e5] bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#071826]">{item.reference}</span><span className="rounded-full bg-[#f1f3f2] px-2.5 py-1 text-[11px] font-bold">{statusNames[item.status] ?? item.status}</span></div>
                <p className="mt-2 break-all text-sm font-bold text-[#425461]">{item.email}</p>
                <p className="mt-1 text-sm text-[#64717c]">{PLAN_NAMES[item.plan]} · {BILLING_INTERVAL_LABELS[item.billing_interval]} · US${(item.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                {item.sender_reference && <p className="mt-3 text-xs leading-5 text-[#64717c]">汇款人：{item.sender_name} · 汇出行：{item.sender_bank}<br />交易号：{item.sender_reference} · 汇款时间：{item.sent_at ? new Date(item.sent_at).toLocaleString("zh-CN") : "—"}</p>}
                {item.customer_note && <p className="mt-2 text-xs text-[#64717c]">客户备注：{item.customer_note}</p>}
              </div>
              {(item.status === "pending" || item.status === "proof_submitted") && <div className="w-full shrink-0 lg:w-80">
                <textarea rows={2} maxLength={1000} placeholder="审核备注；拒绝时必填" value={notes[item.id] ?? ""} onChange={(event) => setNotes((value) => ({ ...value, [item.id]: event.target.value }))} className="w-full rounded-xl border border-[#d4dde1] px-3 py-2 text-sm" />
                <div className="mt-2 flex gap-2">
                  <button disabled={busy !== null} onClick={() => void run({ action: "approve", requestId: item.id, note: notes[item.id] }, item.id)} className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">确认到账并开通</button>
                  <button disabled={busy !== null || !(notes[item.id] ?? "").trim()} onClick={() => void run({ action: "reject", requestId: item.id, note: notes[item.id] }, item.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">拒绝</button>
                </div>
              </div>}
            </div>
          </article>
        ))}
        {!requests.length && <div className="rounded-2xl border border-dashed border-[#cfd9dd] p-8 text-center text-sm text-[#64717c]">没有匹配的电汇申请。</div>}
      </div>

      <h2 className="mt-10 text-xl font-black text-[#071826]">订阅管理</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-white">
        <table className="w-full min-w-[64rem] text-left text-sm"><thead className="bg-[#f1f3f2] text-xs text-[#64717c]"><tr><th className="p-3">账号</th><th>套餐</th><th>来源</th><th>状态</th><th>到期</th><th className="pr-3 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-[#e5eaec]">{subscriptions.map((item) => <tr key={item.id}><td className="p-3 font-bold">{item.email}</td><td>{PLAN_NAMES[item.plan]} · {BILLING_INTERVAL_LABELS[item.billing_interval]}</td><td>{item.payment_source === "stripe" ? "Stripe" : "人工"}</td><td>{statusNames[item.status] ?? item.status}{item.cancel_at_period_end ? "（到期停用）" : ""}</td><td>{item.current_period_end ? new Date(item.current_period_end).toLocaleDateString("zh-CN") : "—"}</td><td className="pr-3 text-right">{item.payment_source === "manual" ? <div className="flex justify-end gap-2"><button disabled={busy !== null} onClick={() => void run({ action: "extend", subscriptionId: item.id }, item.id)} className="rounded-lg border px-2 py-1 text-xs font-bold">续一期</button>{item.cancel_at_period_end ? <button disabled={busy !== null} onClick={() => void run({ action: "resume", subscriptionId: item.id }, item.id)} className="rounded-lg border px-2 py-1 text-xs font-bold">恢复</button> : <button disabled={busy !== null} onClick={() => void run({ action: "cancel_period_end", subscriptionId: item.id }, item.id)} className="rounded-lg border px-2 py-1 text-xs font-bold">到期停用</button>}{confirmingStop === item.id ? <><button disabled={busy !== null} onClick={() => { setConfirmingStop(null); void run({ action: "cancel_now", subscriptionId: item.id }, item.id); }} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-black text-white">确认停用</button><button onClick={() => setConfirmingStop(null)} className="rounded-lg border px-2 py-1 text-xs font-bold">返回</button></> : <button disabled={busy !== null} onClick={() => setConfirmingStop(item.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-700">立即停用</button>}</div> : <span className="text-xs text-[#849098]">请在 Stripe 管理</span>}</td></tr>)}</tbody>
        </table>
      </div>

      <details className="mt-8 rounded-2xl border border-[#dbe2e5] bg-white p-5"><summary className="cursor-pointer font-black text-[#071826]">最近操作记录</summary><div className="mt-4 divide-y text-xs">{(data?.audit ?? []).map((item) => <div key={item.id} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr_1fr]"><span>{new Date(item.created_at).toLocaleString("zh-CN")}</span><span>{item.adminEmail} → {item.email}</span><span>{item.action}{item.note ? ` · ${item.note}` : ""}</span></div>)}</div></details>
    </main>
  );
}
