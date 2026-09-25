import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { getCachedTenderList } from "@/lib/tenders";
import { countryPages, getCountryPage, guidesForCountry } from "@/lib/country-pages";
import { industryPages } from "@/lib/industry-pages";
import { getCountryInsight } from "@/lib/country-insights";
import { liveTenderCountForCountry, liveTenderLinksForCountry } from "@/lib/tender-links";
import { countryLabel } from "@/lib/tender-labels";
import { LIVE_STATUS_FILTER_PARAM } from "@/lib/tender-status";
import { TenderLinkCards } from "@/components/tenders/TenderLinkCards";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { siteOrigin } from "@/lib/site-url";

type CountryPageProps = { params: Promise<{ country: string }> };

/** How many cards the page lists before handing over to the filtered /tenders list. */
const LISTED = 24;

/** Same five minutes the homepage and the cached list use: a new import shows up here as soon as it shows up there. */
export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return countryPages.map((page) => ({ country: page.slug }));
}

export async function generateMetadata({ params }: CountryPageProps): Promise<Metadata> {
  const { country: slug } = await params;
  const page = getCountryPage(slug);
  if (!page) return {};
  const name = countryLabel(page.country, "zh");
  const platforms = guidesForCountry(page.country).map((guide) => guide.platform.split(" · ")[0]).join("、");
  return pageMetadata({
    title: `${name}招标项目｜${name}政府采购与国企招标信息`,
    description: `${name}当前在招的政府采购与国有企业招标项目，来源包括 ${platforms}。提供中文标题、项目摘要、行业与计划交标月份，每日更新，并附${name}参标指南与国家洞察。`,
    path: `/countries/${page.slug}`,
  });
}

export default async function CountryTendersPage({ params }: CountryPageProps) {
  const { country: slug } = await params;
  const page = getCountryPage(slug);
  if (!page) notFound();

  const tenders = await getCachedTenderList();
  const now = new Date();
  const liveCount = liveTenderCountForCountry(tenders, page.country, now);
  const links = liveTenderLinksForCountry(tenders, page.country, { limit: LISTED, now });
  const guides = guidesForCountry(page.country);
  const insight = getCountryInsight(page.slug);
  const name = countryLabel(page.country, "zh");
  const listHref = `/tenders?country=${page.country}&status=${LIVE_STATUS_FILTER_PARAM}`;
  const origin = siteOrigin();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: origin },
      { "@type": "ListItem", position: 2, name: "招标项目", item: `${origin}/tenders` },
      { "@type": "ListItem", position: 3, name: `${name}招标项目`, item: `${origin}/countries/${page.slug}` },
    ],
  };

  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <header className="bg-[#061b2b] px-5 py-12 text-white sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <Link href="/tenders" className="inline-flex items-center gap-2 text-sm font-bold text-white/62 transition hover:text-white">← 全部招标项目</Link>
          <div className="mt-9 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">
                <CountryFlag country={page.country} />
                {name}
              </span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Tenders · 每日更新</span>
            </div>
            <h1 className="mt-5 text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">{name}招标项目</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/68">{page.intro}本页汇总当前仍在招标期内的{name}项目，附中文标题、行业和计划交标月份。</p>
          </div>
          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/12 bg-white/6 px-5 py-4">
              <p className="text-xs font-bold text-white/55">当前在招</p>
              <p className="mt-1 text-2xl font-black text-[#ffb21c]">{liveCount} <span className="text-sm text-white/70">个项目</span></p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/6 px-5 py-4">
              <p className="text-xs font-bold text-white/55">覆盖采购来源</p>
              <p className="mt-1 text-2xl font-black text-white">{guides.length} <span className="text-sm text-white/70">个平台</span></p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Open tenders</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">{name}当前在招项目</h2>
            {liveCount > 0 && <p className="text-sm text-[#64717c]">按计划交标时间由近到远排列</p>}
          </div>
          <div className="mt-6">
            {links.length > 0 ? (
              <TenderLinkCards links={links} />
            ) : (
              <div className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-8 text-sm leading-7 text-[#586873]">
                {name}当前没有仍在招标期内的项目。平台每日更新，新项目发布后会出现在这里。
              </div>
            )}
          </div>
          {liveCount > 0 && (
            <div className="mt-6 flex justify-center">
              <Link href={listHref} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#071826] px-6 text-sm font-black text-white transition hover:bg-[#163b52]">
                {liveCount > links.length ? `在招标列表中查看全部 ${liveCount} 个项目 →` : "在招标列表中按行业、规模筛选 →"}
              </Link>
            </div>
          )}
        </section>

        {guides.length > 0 && (
          <section className="mt-14">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Where to bid</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{name}采购来源与参标指南</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide) => (
                <Link key={guide.slug} href={`/guides/${guide.slug}`} className="group flex h-full flex-col rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 transition hover:-translate-y-0.5 hover:border-[#aebdc3]">
                  <span className="self-start rounded-full bg-[#fff3cf] px-2.5 py-1 text-[11px] font-black text-[#6d4900]">{guide.issuerType}</span>
                  <p className="mt-3 font-black leading-snug">{guide.platform}</p>
                  <p className="mt-2 text-sm leading-6 text-[#586873]">{guide.issuer}</p>
                  <span className="mt-auto pt-4 text-sm font-black text-[#a96100] group-hover:text-[#071826]">阅读参标指南 →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">By industry</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">按行业查看拉美招标项目</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {industryPages.map((industry) => (
              <Link key={industry.slug} href={`/industries/${industry.slug}`} className="rounded-xl border border-[#dbe2e5] bg-[#fffdf9] px-4 py-2.5 text-sm font-black transition hover:-translate-y-0.5 hover:border-[#aebdc3]">
                {industry.name}
              </Link>
            ))}
            <Link href="/weekly" className="rounded-xl border border-[#f0d58a] bg-[#fff6df] px-4 py-2.5 text-sm font-black text-[#7a4f00] transition hover:-translate-y-0.5 hover:border-[#d29a28]">本周招标周报 →</Link>
          </div>
        </section>

        {insight && (
          <section className="mt-14 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">Country insight</p>
            <h2 className="mt-3 text-2xl font-black">{name}国家洞察</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/64">项目列表回答「现在有什么可以投」；国家洞察整理中长期投资规划、重点行业和区域，帮助判断下一批项目会出现在哪里。</p>
            <Link href={`/insights/${insight.slug}`} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black text-[#071826] transition hover:bg-[#ffc34d]">阅读{name}国家洞察 →</Link>
          </section>
        )}
      </main>
    </div>
  );
}
