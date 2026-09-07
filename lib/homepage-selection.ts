import type { HomepageControlSettings } from "@/lib/db/site-settings";
import type { Tender } from "@/types/tender";

function isTender(tender: Tender | undefined): tender is Tender {
  return tender !== undefined;
}

/**
 * Resolve the two homepage collections from the same rules everywhere.
 * Keeping this in one place is important because the access layer treats
 * the free-preview collection as an explicit authorization allow-list.
 */
export function selectHomepageTenders(
  tenders: Tender[],
  settings: HomepageControlSettings,
): { featured: Tender[]; ticker: Tender[] } {
  const sorted = tenders.slice().sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  const bySlug = new Map(tenders.map((tender) => [tender.slug, tender]));
  const legacyFeatured = [
    ...sorted.filter((tender) => tender.homepageFeatured),
    ...sorted.filter((tender) => !tender.homepageFeatured),
  ];
  const featured = (settings.featuredSlugs === null
    ? legacyFeatured
    : settings.featuredSlugs.map((slug) => bySlug.get(slug)).filter(isTender)
  ).slice(0, settings.featuredCount);
  const featuredSlugSet = new Set(featured.map((tender) => tender.slug));
  const ticker = (settings.tickerSlugs === null
    ? sorted.filter((tender) => !featuredSlugSet.has(tender.slug))
    : settings.tickerSlugs
        .map((slug) => bySlug.get(slug))
        .filter(isTender)
        .filter((tender) => !featuredSlugSet.has(tender.slug))
  ).slice(0, settings.tickerCount);

  return { featured, ticker };
}
