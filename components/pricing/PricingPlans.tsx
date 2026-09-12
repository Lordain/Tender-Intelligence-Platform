"use client";

import { useState } from "react";
import Link from "next/link";
import { BILLING_INTERVAL_LABELS, type BillingInterval } from "@/lib/access-control";
import { BILLING_MONTHS, PLAN_PRICES_USD } from "@/lib/billing-catalog";

/**
 * Months covered by one payment. Used both to label the price and to work out
 * what a longer commitment saves against paying monthly, so the discount is
 * derived from the prices rather than written down twice.
 */
const INTERVALS: BillingInterval[] = ["monthly", "semiannual", "annual"];
const PER_PAYMENT_SUFFIX: Record<BillingInterval, string> = { monthly: "USD / 月", semiannual: "USD / 半年", annual: "USD / 年" };

type Plan = {
  id: string;
  eyebrow: string;
  name: string;
  description: string;
  prices: Record<BillingInterval, number> | null;
  features: readonly string[];
};

const PLANS: readonly Plan[] = [
  {
    id: "trial", eyebrow: "注册即享", name: "免费试用 3 天",
    description: "功能与个人版相同，注册后自动开启，无需绑定银行卡。",
    prices: null,
    features: ["招标项目搜索与筛选", "1 个账户登录", "查看全部招标项目", "完整标书详情与招投标时间", "投标要求、资质、风险与官方入口", "新标通知与邮件提醒（每日 2 个时段）"],
  },
  {
    id: "professional", eyebrow: "个人使用", name: "个人版",
    description: "适合独立负责市场机会搜寻与投标准备的专业人士。",
    prices: PLAN_PRICES_USD.professional,
    features: ["招标项目搜索与单行业筛选", "1 个账户登录", "查看全部招标项目", "完整标书详情与招投标时间", "投标要求、资质、风险与官方入口", "新标通知与邮件提醒（每日 2 个时段）"],
  },
  {
    id: "enterprise", eyebrow: "团队协作", name: "企业版",
    description: "适合多人协作、覆盖多个业务方向的企业团队。",
    prices: PLAN_PRICES_USD.enterprise,
    features: ["招标项目搜索与多行业组合筛选", "最多 3 个账户登录", "查看全部招标项目", "完整标书详情与招投标时间", "不同账号可设置不同通知条件", "新标通知与邮件提醒（每日 2 个时段）"],
  },
] as const;

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

function discountPercent(prices: Record<BillingInterval, number>, interval: BillingInterval) {
  const atMonthlyRate = prices.monthly * BILLING_MONTHS[interval];
  if (atMonthlyRate <= prices[interval]) return 0;
  return Math.round((1 - prices[interval] / atMonthlyRate) * 100);
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 fill-none stroke-current stroke-2.2"><path d="m4 10 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function PricingPlans() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <>
      <div className="mt-7 flex justify-center">
        <div role="tablist" aria-label="计费周期" className="inline-flex rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-1">
          {INTERVALS.map((option) => {
            const selected = option === interval;
            // Both paid plans share the same discount curve, so one badge on
            // the tab is accurate for whichever plan the reader is looking at.
            const saving = discountPercent(PLANS[1].prices!, option);
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setInterval(option)}
                className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors sm:px-6 ${selected ? "bg-[#061b2b] text-white" : "text-[#52636e] hover:bg-[#f1f3f2]"}`}
              >
                {BILLING_INTERVAL_LABELS[option]}
                {saving > 0 && <span className={`ml-2 text-[11px] font-bold ${selected ? "text-[#ffd16f]" : "text-[#b86e00]"}`}>省 {saving}%</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const perMonth = plan.prices ? Math.round(plan.prices[interval] / BILLING_MONTHS[interval]) : null;
          const saving = plan.prices ? discountPercent(plan.prices, interval) : 0;
          const href = plan.prices ? `/subscribe?plan=${plan.id}&interval=${interval}` : "/register";

          return (
            <article key={plan.id} className={`flex flex-col overflow-hidden rounded-2xl border bg-[#fffdf9] shadow-[0_24px_60px_-48px_rgba(6,27,43,.5)] ${plan.id === "trial" ? "border-[#e7b84e]" : "border-[#d8e0e3]"}`}>
              <div className="border-b border-[#e2e7e9] p-6 sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">{plan.eyebrow}</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071826]">{plan.name}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#64717c]">{plan.description}</p>
                {plan.prices ? (
                  <>
                    <div className="mt-7 flex items-end gap-2">
                      <span className="text-4xl font-black text-[#071826]">{money(plan.prices[interval])}</span>
                      <span className="pb-1 text-sm font-semibold text-[#64717c]">{PER_PAYMENT_SUFFIX[interval]}</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-[#64717c]">
                      {interval === "monthly"
                        ? "按月付费，可随时取消"
                        : <>相当于 {money(perMonth!)} / 月<span className="ml-2 rounded-full bg-[#fff4d8] px-2 py-0.5 text-[#8a5700]">较按月省 {saving}%</span></>}
                    </p>
                  </>
                ) : (
                  <div className="mt-7 rounded-2xl bg-[#fff4d8] p-4 text-sm font-black text-[#8a5700]">3 天内完整体验个人版全部功能</div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-7">
                <h3 className="text-sm font-black text-[#071826]">方案包含</h3>
                <ul className="mt-5 flex flex-1 flex-col gap-3.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-[#425461]"><span className="text-[#b86e00]"><CheckIcon /></span><span>{feature}</span></li>
                  ))}
                </ul>
                <Link prefetch={false} href={href} className={`mt-7 rounded-xl px-5 py-3 text-center text-sm font-black transition-colors ${plan.id === "trial" ? "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]" : "bg-[#061b2b] text-white hover:bg-[#0a2b40]"}`}>
                  {plan.id === "trial" ? "注册并开始免费试用" : `订阅${BILLING_INTERVAL_LABELS[interval]}`}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
