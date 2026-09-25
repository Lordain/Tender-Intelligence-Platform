import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { getCachedTenderList } from "@/lib/tenders";
import { archiveWeeks } from "@/lib/weekly-digest";
import { formatWeekRange, weekSlug, weekTitle } from "@/lib/weekly";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "拉美招标周报｜每周新发布的政府采购与国企招标项目",
  description: "每周汇总墨西哥、巴西、哥伦比亚、秘鲁、智利新发布的政府采购与国有企业招标项目，按国家和行业整理，附重点项目与计划交标月份。",
  path: "/weekly",
});

export default async function WeeklyArchivePage() {
  const weeks = archiveWeeks(await getCachedTenderList());
  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <header className="bg-[#061b2b] px-5 py-12 text-white sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <Link href="/tenders" className="inline-flex items-center gap-2 text-sm font-bold text-white/62 transition hover:text-white">← 全部招标项目</Link>
          <div className="mt-9 max-w-4xl">
            <span className="inline-flex items-center rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">招标周报</span>
            <h1 className="mt-5 text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">拉美招标周报</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/68">每周汇总墨西哥、巴西、哥伦比亚、秘鲁、智利新发布的政府采购与国有企业招标项目，按国家和行业整理。本周的周报每日更新。</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Archive</p>
        <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">往期周报</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {weeks.map(({ week, count }, index) => (
            <Link key={weekSlug(week)} href={`/weekly/${weekSlug(week)}`} className="group flex items-center justify-between gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4 transition hover:-translate-y-0.5 hover:border-[#aebdc3]">
              <span>
                <span className="flex items-center gap-2 font-black">
                  {weekTitle(week)}
                  {index === 0 && <span className="rounded-full bg-[#fff3cf] px-2 py-0.5 text-[11px] font-black text-[#6d4900]">本周</span>}
                </span>
                <span className="mt-1 block text-sm text-[#586873]">{formatWeekRange(week)} · {count} 个新项目</span>
              </span>
              <span className="text-sm font-black text-[#a96100] group-hover:text-[#071826]">→</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
