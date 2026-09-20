import { getAllTenders, getTendersBySlugs } from "@/lib/tenders";
import { fetchHomepageControlSettings } from "@/lib/db/site-settings";
import { HomeHero } from "@/components/tenders/HomeHero";
import { FeaturedTenders } from "@/components/tenders/FeaturedTenders";
import { ValuePropositions } from "@/components/home/ValuePropositions";
import { CountryInsightsPreview } from "@/components/home/CountryInsightsPreview";
import { ParticipationGuidesPreview } from "@/components/home/ParticipationGuidesPreview";
import { selectHomepageTenders } from "@/lib/homepage-selection";
import { toTenderCardData } from "@/lib/tender-card";
import type { Metadata } from "next";

/** Title and description come from the root layout; only the canonical is this page's own. See app/layout.tsx for why no route inherits one any more. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Same reasoning as app/tenders/page.tsx — see its comment. This page reads the same service-role data and was prerendered at build time with no revalidation, so a newly featured tender never reached the homepage until the next deploy. */
export const revalidate = 300;

export default async function Home() {
  const [tenders, settings] = await Promise.all([getAllTenders(), fetchHomepageControlSettings()]);
  const { featured, ticker } = selectHomepageTenders(tenders, settings);

  // One query for all of them (2026-09-06). getAllTenders() above omits
  // the child-table joins, so the cards' previews need the full row — but
  // fetching it per pick was featuredCount + tickerCount separate
  // single-row queries (13 at the defaults), each joining three child
  // tables, for what is one `.in("slug", …)`.
  const detailBySlug = await getTendersBySlugs([...featured, ...ticker].map((tender) => tender.slug));
  // Projected, not passed through. Both components below are "use client", so
  // whatever they receive is serialized into this page's HTML — and this page
  // is the most crawled one on the site. Handing them a whole Tender put the
  // original-language title, the publishing body, the source URL, the
  // procedure number and the ingestion slug in front of every visitor and
  // every crawler, which is the paywall's entire contents (2026-09-19).
  //
  // Always the guest projection, never a role check: this route is ISR
  // (revalidate = 300 above), so one cached HTML document is served to
  // everybody. Reading the session here would make the homepage dynamic for
  // all visitors to personalize a card, and serving a crawler anything a
  // visitor does not get is cloaking.
  //
  // `memberTitle` is the one place on the site where a guest reads the
  // subscriber's title (2026-09-20, the user: 首页(仅限首页)……都用订阅用户看到
  // 的项目名称). The homepage is the shopfront and a column of 墨西哥
  // 变电站扩建工程 sells nothing; these dozen-odd rows are the sample, the same
  // way the free-preview cards already publish paywalled analysis on purpose.
  // It buys that with a real cost — those titles carry the source proper noun
  // and this page is the one crawlers read most — so it is set HERE, per call,
  // and nowhere else. /tenders, every detail page and every other card stay on
  // publicTitleOf.
  const featuredWithPreviews = featured.map((tender) => toTenderCardData(detailBySlug.get(tender.slug) ?? tender, { includeAnalysisPreview: true, showOneLineSummary: true, memberTitle: true }));
  const tickerWithPreviews = ticker.map((tender) => toTenderCardData(detailBySlug.get(tender.slug) ?? tender, { memberTitle: true }));

  return (
    <div className="flex flex-col">
      <HomeHero tenders={tickerWithPreviews} />
      <FeaturedTenders tenders={featuredWithPreviews} />
      <ValuePropositions />
      <CountryInsightsPreview />
      <ParticipationGuidesPreview />
    </div>
  );
}
