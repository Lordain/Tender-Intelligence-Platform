import { getAllTenders, getTendersBySlugs } from "@/lib/tenders";
import { fetchHomepageControlSettings } from "@/lib/db/site-settings";
import { HomeHero } from "@/components/tenders/HomeHero";
import { FeaturedTenders } from "@/components/tenders/FeaturedTenders";
import { ValuePropositions } from "@/components/home/ValuePropositions";
import { selectHomepageTenders } from "@/lib/homepage-selection";

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
