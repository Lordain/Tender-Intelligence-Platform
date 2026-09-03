"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderCard } from "@/components/tenders/TenderCard";

export function FeaturedTenders({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Latest opportunities</p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
            {localize(uiText.featuredTenders, locale)}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">从最新公开信息中筛选，快速查看项目状态、截止日期与中资相关度。</p>
        </div>
        <Link
          href="/tenders"
          className="hidden shrink-0 text-sm font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-emerald-700 sm:block dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-emerald-400"
        >
          查看全部项目
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender) => (
          <TenderCard key={tender.id} tender={tender} />
        ))}
      </div>

      <Link
        href="/tenders"
        className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-950 hover:bg-zinc-950 hover:text-white sm:hidden dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-white dark:hover:bg-white dark:hover:text-zinc-950"
      >
        查看全部项目
      </Link>
    </section>
  );
}
