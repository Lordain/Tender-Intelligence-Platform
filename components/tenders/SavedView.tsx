"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { useSavedSearches, useSavedTenderIds } from "@/lib/saved";
import { TenderCard } from "@/components/tenders/TenderCard";
import { PageIntro } from "@/components/layout/PageIntro";

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.5} className="size-4" aria-hidden="true">
      <path d="M10 2a5 5 0 0 0-5 5v2.586l-1.707 1.707A1 1 0 0 0 4 13h12a1 1 0 0 0 .707-1.707L15 9.586V7a5 5 0 0 0-5-5Z" />
      <path d="M8 15a2 2 0 0 0 4 0" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function SearchBookmarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="5.5" />
      <path d="m14 14 4 4M17 4h3v8l-1.5-1-1.5 1z" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V22l-6-4-6 4z" />
      <path d="M9 7h6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current stroke-2">
      <path d="M3 10h13m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SavedView({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const { savedIds } = useSavedTenderIds();
  const { searches, removeSearch } = useSavedSearches();
  const savedTenders = tenders.filter((tender) => savedIds.includes(tender.id));

  return (
    <main className="bg-[#f6f4ef] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[94rem]">
        <PageIntro
          eyebrow="My workspace"
          title="我的收藏"
          description="集中管理常用筛选与重点项目，快速返回正在评估和持续跟进的招标机会。"
          metrics={[
            { label: "已保存搜索", value: searches.length, suffix: "项" },
            { label: "已收藏项目", value: savedTenders.length, suffix: "个" },
          ]}
        />

        <section className="mt-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.025em] text-[#071826]">{localize(uiText.savedSearches, locale)}</h2>
              <p className="mt-1.5 text-sm text-[#75838c]">保存常用条件，下次无需重新组合筛选。</p>
            </div>
            {searches.length > 0 && <span className="text-xs font-semibold text-[#64717c]">共 {searches.length} 项</span>}
          </div>

          {searches.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-6 py-10 text-center">
              <span className="text-[#b86e00]"><SearchBookmarkIcon /></span>
              <h3 className="mt-4 text-lg font-black text-[#071826]">还没有保存搜索</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#64717c]">前往招标项目页设置国家、行业和项目阶段，然后保存常用的筛选组合。</p>
              <Link href="/tenders" className="mt-5 inline-flex items-center gap-3 rounded-xl border border-[#0a2b40] px-5 py-2.5 text-sm font-black text-[#0a2b40] transition-colors hover:bg-[#0a2b40] hover:text-white">
                创建筛选 <ArrowIcon />
              </Link>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
              {searches.map((search, index) => (
                <li key={search.id} className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${index > 0 ? "border-t border-[#e5e9eb]" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8b969c]">已保存的筛选</p>
                    <Link href={search.href} className="mt-1 block truncate text-base font-black text-[#071826] hover:text-[#b86e00]">{search.name}</Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled
                      title="通知功能暂未开放"
                      className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-xl border border-[#d8e0e3] bg-[#f2f4f3] px-3 text-xs font-bold text-[#87939a]"
                    >
                      <BellIcon active={false} />
                      通知未开放
                    </button>
                    <Link href={search.href} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#061b2b] px-3 text-xs font-bold text-white hover:bg-[#0a2b40]">查看结果 <ArrowIcon /></Link>
                    <button type="button" onClick={() => removeSearch(search.id)} className="h-9 rounded-xl px-3 text-xs font-semibold text-[#7a878f] hover:bg-[#f2f4f3] hover:text-[#071826]">
                      {localize(uiText.remove, locale)}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-11">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.025em] text-[#071826]">{localize(uiText.savedTenders, locale)}</h2>
              <p className="mt-1.5 text-sm text-[#75838c]">保留重点机会，集中查看交标时间与项目进展。</p>
            </div>
            {savedTenders.length > 0 && <span className="text-xs font-semibold text-[#64717c]">共 {savedTenders.length} 项</span>}
          </div>

          {savedTenders.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-6 py-10 text-center">
              <span className="text-[#b86e00]"><BookmarkIcon /></span>
              <h3 className="mt-4 text-lg font-black text-[#071826]">还没有收藏项目</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#64717c]">浏览招标项目并点击收藏图标，重点项目会集中显示在这里，也会进入交标提醒。</p>
              <Link href="/tenders" className="mt-5 inline-flex items-center gap-3 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247]">
                浏览招标项目 <ArrowIcon />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {savedTenders.map((tender) => <TenderCard key={tender.id} tender={tender} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
