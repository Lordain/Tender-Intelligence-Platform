import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { getCachedTenderList } from "@/lib/tenders";
import { getIndustryPage, industryPages } from "@/lib/industry-pages";
import { countryPages } from "@/lib/country-pages";
import { liveTenderCountsForIndustry, liveTenderLinksForIndustry } from "@/lib/tender-links";
import { countryLabel } from "@/lib/tender-labels";
import { LIVE_STATUS_FILTER_PARAM } from "@/lib/tender-status";
import { TenderLinkCards } from "@/components/tenders/TenderLinkCards";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { siteOrigin } from "@/lib/site-url";

type IndustryPageProps = { params: Promise<{ industry: string }> };

/** How many cards the page lists before handing over to the filtered /tenders list — the country pages' number. */
const LISTED = 24;

/** Same five minutes as the country pages and the cached list. */
export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return industryPages.map((page) => ({ industry: page.slug }));
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const { industry: slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) return {};
  return pageMetadata({
    title: `拉美${page.name}招标项目｜${page.titleTail}`,
    description: `墨西哥、巴西、哥伦比亚、秘鲁、智利五国当前在招的${page.name}类政府采购与国企招标项目，提供中文标题、项目摘要、国家与计划交标月份，每日更新。`,
    path: `/industries/${page.slug}`,
  });
}

/**
 * One page per industry tag, across the five countries (2026-09-25) — the
 * country pages' twin, for the reader who searches by what they build rather
 * than where. Same sections, same components, same design.
 */
export default async function IndustryTendersPage({ params }: IndustryPageProps) {
  const { industry: slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) notFound();

  const tenders = await getCachedTenderList();
  const now = new Date();
  const { total, byCountry } = liveTenderCountsForIndustry(tenders, page.industry, now);
  const links = liveTenderLinksForIndustry(tenders, page.industry, { limit: LISTED, now });
  const countries = countryPages.filter((country) => (byCountry.get(country.country) ?? 0) > 0);
  const listHref = `/tenders?industry=${page.industry}&status=${LIVE_STATUS_FILTER_PARAM}`;
  const otherIndustries = industryPages.filter((other) => other.slug !== page.slug);
  const origin = siteOrigin();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: origin },
      { "@type": "ListItem", position: 2, name: "招标项目", item: `${origin}/tenders` },
      { "@type": "ListItem", position: 3, name: `拉美${page.name}招标项目`, item: `${origin}/industries/${page.slug}` },
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
              <span className="inline-flex items-center rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">{page.name}</span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Tenders by industry · 每日更新</span>
            </div>
            <h1 className="mt-5 text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">拉美{page.name}招标项目</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/68">{page.intro}本页汇总墨西哥、巴西、哥伦比亚、秘鲁、智利当前仍在招标期内的{page.name}项目，附中文标题、国家和计划交标月份。</p>
          </div>
          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/12 bg-white/6 px-5 py-4">
              <p className="text-xs font-bold text-white/55">当前在招</p>
              <p className="mt-1 text-2xl font-black text-[#ffb21c]">{total} <span className="text-sm text-white/70">个项目</span></p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/6 px-5 py-4">
              <p className="text-xs font-bold text-white/55">涉及国家</p>
              <p className="mt-1 text-2xl font-black text-white">{countries.length} <span className="text-sm text-white/70">个</span></p>
            </div>
          </div>
          {countries.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {countries.map((country) => (
                <Link
                  key={country.slug}
                  href={`/tenders?country=${country.country}&industry=${page.industry}&status=${LIVE_STATUS_FILTER_PARAM}`}
                  prefetch={false}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1.5 text-xs font-bold text-white/80 transition hover:border-[#ffb21c] hover:text-white"
                >
                  <CountryFlag country={country.country} />
                  {countryLabel(country.country, "zh")} {byCountry.get(country.country)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Open tenders</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">当前在招的{page.name}项目</h2>
            {total > 0 && <p className="text-sm text-[#64717c]">按计划交标时间由近到远排列</p>}
          </div>
          <div className="mt-6">
            {links.length > 0 ? (
              <TenderLinkCards links={links} />
            ) : (
              <div className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-8 text-sm leading-7 text-[#586873]">
                当前没有仍在招标期内的{page.name}项目。平台每日更新，新项目发布后会出现在这里。
              </div>
            )}
          </div>
          {total > 0 && (
            <div className="mt-6 flex justify-center">
              <Link href={listHref} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#071826] px-6 text-sm font-black text-white transition hover:bg-[#163b52]">
                {total > links.length ? `在招标列表中查看全部 ${total} 个项目 →` : "在招标列表中按国家、规模筛选 →"}
              </Link>
            </div>
          )}
        </section>

        <section className="mt-14">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">By country</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">按国家查看招标项目</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {countryPages.map((country) => (
              <Link key={country.slug} href={`/countries/${country.slug}`} className="group flex items-center justify-between gap-3 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4 transition hover:-translate-y-0.5 hover:border-[#aebdc3]">
                <span className="inline-flex items-center gap-2 font-black"><CountryFlag country={country.country} />{countryLabel(country.country, "zh")}</span>
                <span className="text-sm font-black text-[#a96100] group-hover:text-[#071826]">→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">Other industries</p>
          <h2 className="mt-3 text-2xl font-black">其他行业招标项目</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {otherIndustries.map((other) => (
              <Link key={other.slug} href={`/industries/${other.slug}`} className="rounded-xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-bold transition hover:border-[#ffb21c] hover:bg-white/10">
                {other.name}
              </Link>
            ))}
          </div>
          <Link href="/weekly" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black text-[#071826] transition hover:bg-[#ffc34d]">查看本周招标周报 →</Link>
        </section>
      </main>
    </div>
  );
}
