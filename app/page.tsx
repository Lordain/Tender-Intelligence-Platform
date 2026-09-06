import { getAllTenders, getTendersBySlugs } from "@/lib/tenders";
import { fetchHomepageControlSettings } from "@/lib/db/site-settings";
import { HomeHero } from "@/components/tenders/HomeHero";
import { FeaturedTenders } from "@/components/tenders/FeaturedTenders";
import { ValuePropositions } from "@/components/home/ValuePropositions";
import type { Tender } from "@/types/tender";

/** Same reasoning as app/tenders/page.tsx — see its comment. This page reads the same service-role data and was prerendered at build time with no revalidation, so a newly featured tender never reached the homepage until the next deploy. */
export const revalidate = 300;

function isTender(tender: Tender | undefined): tender is Tender {
  return tender !== undefined;
}

export default async function Home() {
  const [tenders, settings] = await Promise.all([getAllTenders(), fetchHomepageControlSettings()]);
  const sorted = tenders.slice().sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  const bySlug = new Map(tenders.map((tender) => [tender.slug, tender]));

  // Preserve the old curated-checkbox behaviour until the new 首页控制 page
  // is saved once. After that, both lists are exact, ordered admin selections.
  const legacyFeatured = [
    ...sorted.filter((tender) => tender.homepageFeatured),
    ...sorted.filter((tender) => !tender.homepageFeatured),
  ];
  const featured = (settings.featuredSlugs === null
    ? legacyFeatured
    : settings.featuredSlugs.map((slug) => bySlug.get(slug)).filter(isTender)
  ).slice(0, settings.featuredCount);
  const featuredSlugSet = new Set(featured.map((tender) => tender.slug));

  // The ticker is a separate pool and can include any supported country, but
  // it never repeats a project already shown in the free-preview cards.
  const ticker = (settings.tickerSlugs === null
    ? sorted.filter((tender) => !featuredSlugSet.has(tender.slug))
    : settings.tickerSlugs
        .map((slug) => bySlug.get(slug))
        .filter(isTender)
        .filter((tender) => !featuredSlugSet.has(tender.slug))
  ).slice(0, settings.tickerCount);

  // One query for all of them (2026-09-06). getAllTenders() above omits
  // the child-table joins, so the cards' previews need the full row — but
  // fetching it per pick was featuredCount + tickerCount separate
  // single-row queries (13 at the defaults), each joining three child
  // tables, for what is one `.in("slug", …)`.
  const detailBySlug = await getTendersBySlugs([...featured, ...ticker].map((tender) => tender.slug));
  const featuredWithPreviews = featured.map((tender) => detailBySlug.get(tender.slug) ?? tender);
  const tickerWithPreviews = ticker.map((tender) => detailBySlug.get(tender.slug) ?? tender);

  return (
    <div className="flex flex-col">
      <HomeHero tenders={tickerWithPreviews} />
      <FeaturedTenders tenders={featuredWithPreviews} />
      <ValuePropositions />
    </div>
  );
}
