"use client";

import Link from "next/link";
import { localize, uiText, useLocale } from "@/lib/i18n";

const VALUE_POINTS = [
  {
    number: "01",
    title: "发现重点机会",
    description: "聚合拉美公共采购信息，优先呈现值得中国企业关注的项目。",
  },
  {
    number: "02",
    title: "读懂西语标书",
    description: "把原始信息整理为清晰的中文摘要、关键日期与资质要求。",
  },
  {
    number: "03",
    title: "快速判断是否投标",
    description: "保留原始来源与判断依据，让团队更快完成机会筛选。",
  },
] as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current stroke-2">
      <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current stroke-2">
      <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeHero() {
  const { locale } = useLocale();

  return (
    <>
      <section className="relative overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] dark:opacity-10"
        />
        <div aria-hidden="true" className="absolute -right-40 -top-56 size-[34rem] rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/20" />

        <div className="relative mx-auto grid max-w-6xl gap-14 px-6 py-16 sm:py-20 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-16 lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {localize(uiText.tagline, locale)}
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.12] tracking-[-0.035em] text-zinc-950 sm:text-5xl lg:text-[3.5rem] dark:text-white">
              {localize(uiText.heroTitle, locale)}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8 dark:text-zinc-400">
              {localize(uiText.heroSubtitle, locale)}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/tenders"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md dark:bg-white dark:text-zinc-950 dark:hover:bg-emerald-300"
              >
                {localize(uiText.browseTenders, locale)}
                <ArrowIcon />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                了解分析流程
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {["中西文对照", "关键资质提炼", "原始来源可追溯"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <span className="text-emerald-600 dark:text-emerald-400"><CheckIcon /></span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-100 via-white to-zinc-100 blur-2xl dark:from-emerald-950 dark:via-zinc-950 dark:to-zinc-900" />
            <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/90 shadow-[0_24px_80px_-32px_rgba(24,24,27,0.35)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-medium text-zinc-400">TENDER BRIEF</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">项目情报摘要</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">持续更新</span>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">原始招标信息</span>
                    <span className="text-zinc-400">ES → 中文</span>
                  </div>
                  <div className="space-y-2 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950/70">
                    <div className="h-2 w-11/12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-2 w-8/12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                    <p className="text-[11px] text-zinc-400">项目状态</p>
                    <p className="mt-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">招标中</p>
                  </div>
                  <div className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                    <p className="text-[11px] text-zinc-400">情报完整度</p>
                    <p className="mt-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">来源已核验</p>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    <span className="flex size-6 items-center justify-center rounded-full bg-amber-200/70 text-xs dark:bg-amber-900">!</span>
                    投标前重点核查
                  </div>
                  <p className="mt-2 text-xs leading-5 text-amber-800/80 dark:text-amber-300/80">参与范围、资质文件与关键截止日期均从原始文件中提炼。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mx-auto grid max-w-6xl divide-y divide-zinc-200 px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800">
          {VALUE_POINTS.map((item) => (
            <div key={item.number} className="group py-7 sm:px-6 sm:first:pl-0 sm:last:pr-0 lg:py-9">
              <div className="flex items-start gap-4">
                <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">{item.number}</span>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</h2>
                  <p className="mt-1.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
