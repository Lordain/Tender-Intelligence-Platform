"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { TRIAL_DAYS } from "@/lib/access-control";
import { ANNUAL_SAVING_PERCENT, INTERVAL_UNIT_ZH, PLAN_PRICES_USD, USD_CNY_REFERENCE_RATE, type PaidInterval, type PaidPlan } from "@/lib/billing-catalog";

type FeatureIcon = "user" | "users" | "globe" | "pin" | "document" | "analysis" | "bell" | "history" | "bookmark" | "tag" | "download" | "chart";

/** Each feature with the icon drawn beside it, as on Vercel's pricing page (user, 2026-10-05: 把 √ 也像Vercel做成小icon). */
const plans: { id: "free" | PaidPlan; name: string; audience: string; features: [FeatureIcon, string][] }[] = [
  { id: "free", name: "免费版", audience: "初步了解拉美市场", features: [["user", "1 个账号"], ["globe", "全部国家的公开项目标题"], ["document", "每月可查看 5 个项目的完整详情和标书分析"], ["bell", "每周 1 次项目提醒"], ["history", "可阅读历史项目"]] },
  { id: "basic", name: "基础个人版", audience: "外贸经理、市场负责人", features: [["user", "1 个账号"], ["pin", "选择 1 个国家，查看该国全部项目详情"], ["analysis", "可查看所选国家的完整标书分析"], ["globe", "其他国家可浏览公开项目标题"], ["bell", "每日 1 次行业项目提醒"], ["bookmark", "收藏与跟踪项目"], ["download", "导出所选国家的项目详情 Word"], ["history", "可阅读历史项目"]] },
  { id: "professional", name: "专业个人版", audience: "拉美负责人", features: [["user", "1 个账号"], ["globe", "全部国家完整中文项目详情"], ["analysis", "可查看完整标书分析"], ["bell", "每日 2 次项目提醒"], ["tag", "自定义提醒关键词"], ["bookmark", "收藏与跟踪项目"], ["download", "导出项目详情 Word"]] },
  { id: "enterprise", name: "专业企业版", audience: "拉美拓展小组", features: [["users", "3 个账号，各自设置项目提醒"], ["globe", "全部国家完整中文项目详情"], ["analysis", "可查看完整标书分析"], ["bookmark", "收藏与跟踪项目"], ["download", "导出项目详情 Word"], ["chart", "每月标准化行业分析报告"]] },
];

/**
 * The plan the grid sets apart — white card, 推荐 chip, filled button — the
 * way Vercel's pricing page sets apart Pro (user, 2026-10-05: 参考Vercel的设计
 * 风格帮我优化). Only the look: prices, links and copy are the same for all.
 */
const RECOMMENDED: (typeof plans)[number]["id"] = "professional";

const ICON_PATHS: Record<FeatureIcon, ReactNode> = {
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15.5 5.8a3 3 0 0 1 0 5.6M17 14.6c2 .4 3.3 1.9 3.7 4.4" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  document: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" /></>,
  analysis: <><path d="M13 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H11M13 3.5V8h4.5v2" /><circle cx="15.5" cy="15.5" r="3" /><path d="m17.7 17.7 2.3 2.3" /></>,
  bell: <><path d="M5 18h14l-1.5-2v-5a5.5 5.5 0 0 0-11 0v5Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  history: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v3.8h3.8M12 8v4.3l2.8 1.7" />,
  bookmark: <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1Z" />,
  tag: <><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0Z" /><circle cx="8" cy="8" r="1.3" /></>,
  download: <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />,
  chart: <path d="M4 20h16M7 16.5v-5M12 16.5V7M17 16.5v-8" />,
};

/**
 * Three pages of a sample 行业分析月报 under 每月标准化行业分析报告, small, so
 * the line shows what the report looks like rather than only naming it
 * (user, 2026-10-05: 请你自己做更偏一个行业维度分析的标准化报告，放几张示意图).
 * Laid out from the September figures (industry × country, size structure by
 * industry, an industry focus), with every number and sentence blurred: it
 * shows what the report looks like, not its data (user, 2026-10-05: 把这些
 * 图片的内容打码，不直接展示数据). Each opens full size in a new tab.
 */
const REPORT_SAMPLES = [
  { id: "01", title: "五国行业项目分布" },
  { id: "02", title: "各行业项目规模结构" },
  { id: "03", title: "行业聚焦：交通" },
];

function ReportSamples() {
  return (
    <div className="mt-3 pl-8">
      <div className="grid max-w-[16.5rem] grid-cols-3 gap-2">
        {REPORT_SAMPLES.map((sample) => (
          <a
            key={sample.id}
            href={`/pricing/industry-sample-${sample.id}.webp`}
            target="_blank"
            rel="noopener noreferrer"
            title={`示例：${sample.title}（点击查看大图）`}
            className="group block overflow-hidden rounded-md border border-[#dbe2e5] bg-[#f7f4ee] shadow-[0_8px_18px_-14px_rgba(6,27,43,.55)] transition-transform hover:-translate-y-0.5 hover:border-[#b86e00]"
          >
            <Image
              src={`/pricing/industry-sample-${sample.id}-thumb.webp`}
              alt={`行业分析月报示例页：${sample.title}`}
              width={360}
              height={480}
              sizes="88px"
              className="block h-auto w-full"
            />
          </a>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-[#7a878f]">示例：2026 年 9 月拉美行业分析月报</p>
    </div>
  );
}

function FeatureIconSvg({ name }: { name: FeatureIcon }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-[3px] size-[18px] shrink-0 fill-none stroke-[#52636e]" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

export function PricingPlans() {
  const [interval, setBillingInterval] = useState<PaidInterval>("monthly");
  return (
    <>
    <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <p className="inline-flex items-center gap-2 rounded-xl border border-[#dde3e4] bg-white px-3.5 py-1.5 text-sm text-[#425461]">
        <span className="size-1.5 rounded-full bg-[#ffb21c]" aria-hidden="true" />
        注册即享 <strong className="font-black text-[#071826]">{TRIAL_DAYS} 天</strong>完整项目详情试用
      </p>
      <div role="group" aria-label="付费周期" className="inline-flex rounded-xl border border-[#dde3e4] bg-white p-1">
        {(["monthly", "annual"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => setBillingInterval(option)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${interval === option ? "bg-[#061b2b] text-white" : "text-[#425461] hover:text-[#071826]"}`}
          >
            {option === "monthly" ? "按月付" : <>按年付<span className={`ml-2 rounded-md px-1.5 py-0.5 text-xs ${interval === option ? "bg-[#ffb21c] text-[#071826]" : "bg-emerald-50 text-emerald-700"}`}>省 {ANNUAL_SAVING_PERCENT}%</span></>}
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
              {recommended && <span className="rounded-md bg-[#eef1f1] px-2 py-0.5 text-xs font-semibold text-[#425461]">推荐</span>}
            </div>
            {/* One height for the price block in both cycles, so the rules
                below line up across the row. */}
            <div className="mt-5 md:min-h-[6.5rem]">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-5xl font-black leading-none tracking-[-0.05em] text-[#071826]">{plan.id === "free" ? "免费" : `$${PLAN_PRICES_USD[plan.id][interval].toLocaleString("en-US")}`}</span>
                <span className="text-sm font-semibold text-[#64717c]">{plan.id === "free" ? "长期使用" : `USD / ${INTERVAL_UNIT_ZH[interval]}`}</span>
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
              {plan.features.map(([icon, feature]) => (
                <li key={feature} className="text-[15px] leading-6 text-[#2b3f4c]">
                  <span className="flex gap-3">
                    <FeatureIconSvg name={icon} />
                    {feature}
                  </span>
                  {icon === "chart" && <ReportSamples />}
                </li>
              ))}
            </ul>
            <Link
              prefetch={false}
              href={plan.id === "free" ? "/register" : `/subscribe?plan=${plan.id}&interval=${interval}`}
              className={`mt-9 inline-flex min-h-11 w-fit items-center self-start rounded-xl px-6 text-sm font-bold transition-colors ${recommended ? "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]" : "border border-[#d3dadc] bg-white text-[#071826] hover:border-[#9babb3]"}`}
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
