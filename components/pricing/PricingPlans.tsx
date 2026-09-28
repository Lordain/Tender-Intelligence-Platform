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

export function PricingPlans() {
  const [interval, setBillingInterval] = useState<PaidInterval>("monthly");
  return (
    <>
    <div className="mt-8 flex justify-center">
      <div role="group" aria-label="付费周期" className="inline-flex rounded-xl border border-[#d8e0e3] bg-white p-1">
        {(["monthly", "annual"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => setBillingInterval(option)}
            className={`rounded-lg px-4 py-2 text-sm font-black ${interval === option ? "bg-[#061b2b] text-white" : "text-[#425461] hover:bg-[#f1f4f4]"}`}
          >
            {option === "monthly" ? "按月付" : <>按年付<span className={`ml-2 rounded-md px-1.5 py-0.5 text-xs ${interval === option ? "bg-[#ffb21c] text-[#071826]" : "bg-emerald-50 text-emerald-700"}`}>省 {ANNUAL_SAVING_PERCENT}%</span></>}
          </button>
        ))}
      </div>
    </div>
    <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <article key={plan.id} className="flex flex-col rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-6 shadow-[0_24px_60px_-48px_rgba(6,27,43,.5)]">
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[#b86e00]">{plan.audience}</p>
          <h2 className="mt-3 text-2xl font-black text-[#071826]">{plan.name}</h2>
          <div className="mt-5 flex min-h-24 flex-col">
            <p className="text-3xl font-black text-[#071826]">{plan.id === "free" ? "免费" : `$${PLAN_PRICES_USD[plan.id][interval].toLocaleString("en-US")}`}<span className="ml-1 text-sm font-semibold text-[#64717c]">{plan.id === "free" ? "长期使用" : `USD / ${INTERVAL_UNIT_ZH[interval]}`}</span></p>
            {plan.id !== "free" && <p className="mt-2 text-sm font-bold text-[#a96100]">约 ¥{Math.round(PLAN_PRICES_USD[plan.id][interval] * USD_CNY_REFERENCE_RATE).toLocaleString("zh-CN")} RMB / {INTERVAL_UNIT_ZH[interval]}</p>}
            {plan.id !== "free" && interval === "annual" && <p className="mt-1 text-xs font-bold text-emerald-700">比按月付省 {ANNUAL_SAVING_PERCENT}%</p>}
            <p className="mt-auto text-xs text-[#64717c]">{plan.id === "free" ? "注册后持续开放" : `${TRIAL_DAYS} 天免费试用，无需绑定银行卡`}</p>
          </div>
          <ul className="mt-7 flex-1 space-y-3 border-t border-[#e2e7e9] pt-6">
            {plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm leading-6 text-[#425461]"><span className="font-black text-[#b86e00]">✓</span>{feature}</li>)}
          </ul>
          <Link prefetch={false} href={plan.id === "free" ? "/register" : `/subscribe?plan=${plan.id}&interval=${interval}`} className="mt-8 rounded-xl bg-[#061b2b] px-5 py-3 text-center text-sm font-black text-white hover:bg-[#0a2b40]">{plan.id === "free" ? "免费注册" : "选择方案"}</Link>
        </article>
      ))}
    </div>
    </>
  );
}
