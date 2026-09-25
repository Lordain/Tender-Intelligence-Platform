import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { getCachedTenderList } from "@/lib/tenders";
import { digestSummary, weeklyDigest, ARCHIVE_WEEKS } from "@/lib/weekly-digest";
import { compareWeeks, formatWeekRange, isoWeekOf, parseWeekSlug, shiftWeek, weekSlug, weekTitle, type IsoWeek } from "@/lib/weekly";
import { countryPagePath } from "@/lib/country-pages";
import { industryPages } from "@/lib/industry-pages";
import { countryLabel } from "@/lib/tender-labels";
import { TenderLinkCards, TenderLinkList } from "@/components/tenders/TenderLinkCards";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { siteOrigin } from "@/lib/site-url";

type WeeklyPageProps = { params: Promise<{ week: string }> };

/** Cards at the head of the page; the rest of the week is in the per-country lists. */
const HIGHLIGHTS = 6;
/** Rows per country before handing over to that country's page. */
const PER_COUNTRY = 20;

export const revalidate = 300;
// A new week has to appear without a deploy, so weeks render on first request.
export const dynamicParams = true;

export function generateStaticParams() {
  const current = isoWeekOf(new Date());
  return [0, 1, 2, 3].map((back) => ({ week: weekSlug(shiftWeek(current, -back)) }));
}

/** A week the digest covers: not in the future, not past the archive. */
function coveredWeek(slug: string): IsoWeek | undefined {
  const week = parseWeekSlug(slug);
  if (!week) return undefined;
  const current = isoWeekOf(new Date());
  if (compareWeeks(week, current) > 0 || compareWeeks(week, shiftWeek(current, -(ARCHIVE_WEEKS - 1))) < 0) return undefined;
  return week;
}

export async function generateMetadata({ params }: WeeklyPageProps): Promise<Metadata> {
  const week = coveredWeek((await params).week);
  if (!week) return {};
  const digest = weeklyDigest(await getCachedTenderList(), week);
  return pageMetadata({
    title: `拉美招标周报｜${weekTitle(week)}（${formatWeekRange(week)}）新发布项目`,
    description: `${formatWeekRange(week)}拉美五国新发布的政府采购与国企招标项目。${digestSummary(digest)}`,
    path: `/weekly/${weekSlug(week)}`,
  });
}

/**
 * One week of new tenders (2026-09-25): a page that is new every week for
 * search engines, and a page the team can forward as-is to a WeChat group
 * or a 百家号 post. Built from the same guest projection as every other
 * public list — public titles, month-precision deadlines.
 */
export default async function WeeklyDigestPage({ params }: WeeklyPageProps) {
  const week = coveredWeek((await params).week);
  if (!week) notFound();

  const digest = weeklyDigest(await getCachedTenderList(), week);
  // An empty past week is a page with nothing to say; the current one is
  // kept, since it fills as the week goes on.
  if (digest.links.length === 0 && !digest.isCurrent) notFound();

  // Only link a week the archive still covers — past it the link would 404.
  const previous = coveredWeek(weekSlug(shiftWeek(week, -1)));
  const next = digest.isCurrent ? undefined : shiftWeek(week, 1);
  const origin = siteOrigin();
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: origin },
      { "@type": "ListItem", position: 2, name: "招标周报", item: `${origin}/weekly` },
      { "@type": "ListItem", position: 3, name: weekTitle(week), item: `${origin}/weekly/${weekSlug(week)}` },
    ],
  };

  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <header className="bg-[#061b2b] px-5 py-12 text-white sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <Link href="/weekly" className="inline-flex items-center gap-2 text-sm font-bold text-white/62 transition hover:text-white">← 全部周报</Link>
          <div className="mt-9 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">招标周报</span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">{digest.isCurrent ? "Weekly · 本周每日更新" : "Weekly"}</span>
            </div>
            <h1 className="mt-5 text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">拉美招标周报 · {weekTitle(week)}</h1>
            <p className="mt-3 text-lg font-bold text-white/80">{formatWeekRange(week)}</p>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/68">{digestSummary(digest)}</p>
          </div>
          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/12 bg-white/6 px-5 py-4">
              <p className="text-xs font-bold text-white/55">新发布项目</p>
              <p className="mt-1 text-2xl font-black text-[#ffb21c]">{digest.links.length} <span className="text-sm text-white/70">个</span></p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/6 px-5 py-4">
              <p className="text-xs font-bold text-white/55">其中大中型项目</p>
              <p className="mt-1 text-2xl font-black text-white">{digest.highlights.length} <span className="text-sm text-white/70">个</span></p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {digest.highlights.length > 0 && (
          <section>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Highlights</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">本周重点项目</h2>
            <div className="mt-6">
              <TenderLinkCards links={digest.highlights.slice(0, HIGHLIGHTS)} />
            </div>
          </section>
        )}

        {digest.byCountry.map((group) => {
          const name = countryLabel(group.country, "zh");
          return (
            <section key={group.country} className="mt-14 first:mt-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="inline-flex items-center gap-2 text-2xl font-black tracking-[-0.03em]"><CountryFlag country={group.country} />{name} · {group.links.length} 个新项目</h2>
                <Link href={countryPagePath(group.country)} className="text-sm font-black text-[#a96100] transition hover:text-[#071826]">{name}全部在招项目 →</Link>
              </div>
              <div className="mt-5">
                <TenderLinkList links={group.links.slice(0, PER_COUNTRY)} />
              </div>
              {group.links.length > PER_COUNTRY && (
                <p className="mt-3 text-sm text-[#64717c]">另有 {group.links.length - PER_COUNTRY} 个项目，可在<Link href={countryPagePath(group.country)} className="font-black text-[#a96100] hover:text-[#071826]">{name}招标项目</Link>页查看。</p>
              )}
            </section>
          );
        })}

        <nav className="mt-14 flex flex-col gap-3 sm:flex-row sm:justify-between">
          {previous ? <Link href={`/weekly/${weekSlug(previous)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#cbd6da] bg-[#fffdf9] px-6 text-sm font-black transition hover:border-[#aebdc3]">← 上一周：{weekTitle(previous)}</Link> : <span />}
          {next && <Link href={`/weekly/${weekSlug(next)}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#cbd6da] bg-[#fffdf9] px-6 text-sm font-black transition hover:border-[#aebdc3]">下一周：{weekTitle(next)} →</Link>}
        </nav>

        <section className="mt-14 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">By industry</p>
          <h2 className="mt-3 text-2xl font-black">按行业查看在招项目</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {industryPages.map((page) => (
              <Link key={page.slug} href={`/industries/${page.slug}`} className="rounded-xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-bold transition hover:border-[#ffb21c] hover:bg-white/10">
                {page.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
