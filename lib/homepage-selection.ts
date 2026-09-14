// Type-only, and the two server modules below are imported lazily inside the
// one function that needs them. selectHomepageTenders is a pure rule about
// what the homepage shows; keeping this file's TOP LEVEL free of
// "server-only" is what lets it be tested offline
// (scripts/test-homepage-selection.ts) instead of only in production.
import type { HomepageControlSettings } from "@/lib/db/site-settings";
import { isClosedTender } from "@/lib/access-control";
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

  // "Closing soonest, nearest first" — the default (see HomepageTickerMode).
  //
  // A tender with no deadline cannot be ranked by one and is left out rather
  // than parked at either end; a closed one has nothing left to bid on. Both
  // questions are answered by the same rules the rest of the site uses: the
  // status here is already derived (deriveTenderStatus runs in toTender), so
  // a deadline that passed this morning has already made it closed.
  const byDeadline = tenders
    .filter((tender) => tender.submissionDeadline && !isClosedTender(tender.status))
    .sort((a, b) => a.submissionDeadline!.localeCompare(b.submissionDeadline!));

  const tickerSource = settings.tickerMode === "deadline"
    ? byDeadline
    : settings.tickerSlugs === null
      ? sorted
      : settings.tickerSlugs.map((slug) => bySlug.get(slug)).filter(isTender);

  const ticker = tickerSource
    .filter((tender) => !featuredSlugSet.has(tender.slug))
    .slice(0, settings.tickerCount);

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
  const { fetchHomepageControlSettings } = await import("@/lib/db/site-settings");
  const settings = await fetchHomepageControlSettings();
  if (settings.featuredSlugs !== null) {
    return settings.featuredSlugs.slice(0, settings.featuredCount).includes(slug);
  }
  const { getCachedTenderList } = await import("@/lib/tenders");
  return selectHomepageTenders(await getCachedTenderList(), settings).featured.some(
    (tender) => tender.slug === slug,
  );
}
