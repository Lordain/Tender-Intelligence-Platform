import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { filterTenders } from "@/lib/filter-tenders";
import { getCachedTenderList } from "@/lib/tenders";
import { industryLabel, countryLabel } from "@/lib/tender-labels";
import { publicTenderPath } from "@/lib/public-tender-url";
import { toTenderListItem } from "@/lib/tender-list-page";

export const metadata: Metadata = { title: "行业月报｜LatinTender", robots: { index: false, follow: false } };

export default async function IndustryReport({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const entitlement = await getViewerEntitlement();
  if (entitlement.role !== "subscriber" || entitlement.plan !== "enterprise") redirect("/pricing");
  const params = await searchParams;
  const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const monthParts = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const currentMonth = `${monthParts.year}-${monthParts.month}`;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : currentMonth;
  const tenders = filterTenders(await getCachedTenderList(), {}, "zh").filter((tender) => tender.createdAt.startsWith(month));
  const counts = new Map<string, number>();
  for (const tender of tenders) for (const industry of tender.industries) counts.set(industry, (counts.get(industry) ?? 0) + 1);
  const sectors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const countries = new Map<string, number>();
  for (const tender of tenders) countries.set(tender.country, (countries.get(tender.country) ?? 0) + 1);
  const notable = [...tenders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Monthly industry report</p>
    <h1 className="mt-3 text-3xl font-black text-[#071826]">{month.replace("-", "年")}月行业月报</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-[#64717c]">基于 LatinTender 本月收录的公开项目生成。行业计数包含跨行业项目，因此各行业数量相加可能高于项目总数；这份报告反映平台收录情况，不代表各国采购市场全量。</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-[#dbe2e5] bg-white p-6"><p className="text-sm text-[#64717c]">本月新增项目</p><p className="mt-2 text-4xl font-black text-[#071826]">{tenders.length}</p></div><div className="rounded-2xl border border-[#dbe2e5] bg-white p-6"><p className="text-sm text-[#64717c]">覆盖国家</p><p className="mt-2 text-4xl font-black text-[#071826]">{countries.size}</p></div></div>
    <section className="mt-8 rounded-2xl border border-[#dbe2e5] bg-white p-6"><h2 className="text-xl font-black text-[#071826]">行业分布</h2><div className="mt-5 space-y-3">{sectors.map(([industry, count]) => <div key={industry} className="flex items-center justify-between border-b border-[#e7ecee] py-2 text-sm"><span>{industryLabel(industry, "zh")}</span><strong>{count} 个项目</strong></div>)}</div></section>
    <section className="mt-8 rounded-2xl border border-[#dbe2e5] bg-white p-6"><h2 className="text-xl font-black text-[#071826]">国家分布</h2><div className="mt-5 flex flex-wrap gap-3">{[...countries.entries()].map(([country, count]) => <span key={country} className="rounded-full bg-[#f1f5f5] px-4 py-2 text-sm">{countryLabel(country, "zh")} · {count}</span>)}</div></section>
    <section className="mt-8 rounded-2xl border border-[#dbe2e5] bg-white p-6"><h2 className="text-xl font-black text-[#071826]">本月项目样本</h2><div className="mt-5 divide-y divide-[#e7ecee]">{notable.map((tender) => <Link key={tender.id} href={publicTenderPath(tender)} className="block py-3 text-sm font-semibold text-[#16415a] hover:underline">{toTenderListItem(tender, { memberView: true }).titleZh} · {countryLabel(tender.country, "zh")}</Link>)}</div></section>
  </main>;
}
