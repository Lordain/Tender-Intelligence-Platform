"use client";

import { useState } from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/access-control";
import { ANNUAL_SAVING_PERCENT, INTERVAL_UNIT_ZH, PLAN_PRICES_USD, USD_CNY_REFERENCE_RATE, type PaidInterval, type PaidPlan } from "@/lib/billing-catalog";

const plans: { id: "free" | PaidPlan; name: string; audience: string; features: string[] }[] = [
  { id: "free", name: "免费版", audience: "初步了解拉美市场", features: ["1 个账号", "全部国家的公开项目标题", "每月可查看 5 个项目的完整详情和标书分析", "每周 1 次项目提醒", "可阅读历史项目"] },
  { id: "basic", name: "基础个人版", audience: "外贸经理、市场负责人", features: ["1 个账号", "选择 1 个国家，查看该国全部项目详情", "可查看所选国家的完整标书分析", "其他国家可浏览公开项目标题", "每日 1 次行业项目提醒", "收藏与跟踪项目", "可阅读历史项目"] },
  { id: "professional", name: "专业个人版", audience: "拉美负责人", features: ["1 个账号", "全部国家完整中文项目详情", "可查看完整标书分析", "每日 2 次项目提醒", "自定义提醒关键词", "收藏与跟踪项目", "导出当前项目清单 CSV"] },
  { id: "enterprise", name: "专业企业版", audience: "拉美拓展小组", features: ["3 个账号，各自设置项目提醒", "全部国家完整中文项目详情", "可查看完整标书分析", "收藏与跟踪项目", "导出当前及历史项目清单 CSV", "每月标准化行业分析报告"] },
];

/**
 * The plan the grid sets apart — white card, 推荐 chip, filled button — the
 * way Vercel's pricing page sets apart Pro (user, 2026-10-05: 参考Vercel的设计
 * 风格帮我优化). Only the look: prices, links and copy are the same for all.
 */
const RECOMMENDED: (typeof plans)[number]["id"] = "professional";

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-[3px] size-[18px] shrink-0 fill-none stroke-[#7d8b93]" strokeWidth={1.5}>
      <circle cx="10" cy="10" r="8.25" />
      <path d="m6.6 10.2 2.3 2.3 4.5-4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PricingPlans() {
  const [interval, setBillingInterval] = useState<PaidInterval>("monthly");
  return (
    <>
    <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <p className="inline-flex items-center gap-2 rounded-full border border-[#dde3e4] bg-white px-3.5 py-1.5 text-sm text-[#425461]">
        <span className="size-1.5 rounded-full bg-[#ffb21c]" aria-hidden="true" />
        注册即享 <strong className="font-black text-[#071826]">{TRIAL_DAYS} 天</strong>完整项目详情试用
      </p>
      <div role="group" aria-label="付费周期" className="inline-flex rounded-full border border-[#dde3e4] bg-white p-1">
        {(["monthly", "annual"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => setBillingInterval(option)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${interval === option ? "bg-[#061b2b] text-white" : "text-[#425461] hover:text-[#071826]"}`}
          >
            {option === "monthly" ? "按月付" : <>按年付<span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${interval === option ? "bg-[#ffb21c] text-[#071826]" : "bg-emerald-50 text-emerald-700"}`}>省 {ANNUAL_SAVING_PERCENT}%</span></>}
          </button>
        ))}
      </div>
    </div>
    {/* One bordered grid with hairline dividers rather than four floating
        cards: the 1px gap shows the container's colour between the cells,
        so the lines are right at four, two and one column alike. */}
    <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-[#dde3e4] bg-[#dde3e4] md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const recommended = plan.id === RECOMMENDED;
        return (
          <article key={plan.id} className={`flex flex-col p-6 sm:p-8 ${recommended ? "bg-white" : "bg-[#fbfaf6]"}`}>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-[#071826]">{plan.name}</h2>
              {recommended && <span className="rounded-full bg-[#eef1f1] px-2.5 py-0.5 text-xs font-semibold text-[#425461]">推荐</span>}
            </div>
            {/* One height for the price block in both cycles, so the rules
                below line up across the row. */}
            <div className="mt-5 md:min-h-[6.5rem]">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-5xl font-black leading-none tracking-[-0.05em] text-[#071826]">{plan.id === "free" ? "免费" : `$${PLAN_PRICES_USD[plan.id][interval].toLocaleString("en-US")}`}</span>
                <span className="font-mono text-sm text-[#64717c]">{plan.id === "free" ? "长期使用" : `USD / ${INTERVAL_UNIT_ZH[interval]}`}</span>
              </p>
              {plan.id !== "free" && <p className="mt-3 text-sm font-bold text-[#8a5b11]">约 ¥{Math.round(PLAN_PRICES_USD[plan.id][interval] * USD_CNY_REFERENCE_RATE).toLocaleString("zh-CN")} RMB / {INTERVAL_UNIT_ZH[interval]}</p>}
              {plan.id !== "free" && interval === "annual" && <p className="mt-1 text-xs font-bold text-emerald-700">比按月付省 {ANNUAL_SAVING_PERCENT}%</p>}
            </div>
            <p className="mt-4 text-[15px] leading-7 text-[#52636e]">
              适合{plan.audience}。
              <br />
              {plan.id === "free" ? "注册后持续开放。" : `${TRIAL_DAYS} 天免费试用，无需绑定银行卡。`}
            </p>
            <ul className="mt-7 flex-1 space-y-3.5 border-t border-[#e5e9ea] pt-7">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-[15px] leading-6 text-[#2b3f4c]">
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              prefetch={false}
              href={plan.id === "free" ? "/register" : `/subscribe?plan=${plan.id}&interval=${interval}`}
              className={`mt-9 inline-flex min-h-11 w-fit items-center rounded-full px-5 text-sm font-bold transition-colors ${recommended ? "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]" : "border border-[#d3dadc] bg-white text-[#071826] hover:border-[#9babb3]"}`}
            >
              {plan.id === "free" ? "免费注册" : "选择方案"}
            </Link>
          </article>
        );
      })}
    </div>
    </>
  );
}
