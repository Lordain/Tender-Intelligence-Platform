import { fetchHomepageControlSettings, type HomepageControlSettings } from "@/lib/db/site-settings";
import { getCachedTenderList } from "@/lib/tenders";
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

/**
 * Is this slug one of the homepage free-preview projects — the allow-list
 * that lets a guest open a full detail page?
 *
 * Answering it does not need the tender table at all in the normal case: a
 * saved 首页控制 selection is already an exact, ordered list of slugs. Only
 * the legacy fallback (featuredSlugs === null, i.e. the control page has
 * never been saved) has to rank every row, and that path disappears the
 * first time an admin saves. The detail page runs this on every view, so the
 * difference is a full-table read per project view versus none.
 */
export async function isHomepageFreePreviewSlug(slug: string): Promise<boolean> {
  const settings = await fetchHomepageControlSettings();
  if (settings.featuredSlugs !== null) {
    return settings.featuredSlugs.slice(0, settings.featuredCount).includes(slug);
  }
  return selectHomepageTenders(await getCachedTenderList(), settings).featured.some(
    (tender) => tender.slug === slug,
  );
}
