import { calendarDateBucket, interleaveCountriesWithinEqualGroups } from "@/lib/country-interleave";
import { ALL_INDUSTRIES } from "@/lib/industry";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

/**
 * What a visitor sees first, on the homepage carousel and at the top of
 * /tenders (user, 2026-10-02 — 这是用户第一眼看到我们的入口):
 *
 *   1. two projects from every industry, so the first screen shows the whole
 *      range rather than whichever sector published most this week;
 *   2. 大型项目 first, then 中型项目, inside each industry and overall;
 *   3. countries interleaved last, inside each size band.
 *
 * Within a size band the nearer deadline wins, so of two 大型 power projects
 * the one closing sooner is shown. A tender counts once, for the first
 * industry that picks it, even when it carries several tags. An industry with
 * fewer than two live projects simply shows what it has.
 */
export const SHOWCASE_PER_INDUSTRY = 2;

const TIER_RANK: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 1, standard: 2, excluded: 3 };

function deadlineMs(tender: Tender): number {
  const time = tender.submissionDeadline ? new Date(tender.submissionDeadline).getTime() : NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/** Bigger first; within a size, nearest deadline first (none last); then newest. */
export function compareBySizeThenDeadline(a: Tender, b: Tender): number {
  return (
    TIER_RANK[a.relevance.tier] - TIER_RANK[b.relevance.tier] ||
    deadlineMs(a) - deadlineMs(b) ||
    b.publicationDate.localeCompare(a.publicationDate)
  );
}

/** Size band, then deadline day: the groups countries are interleaved within. */
function sizeAndDayKey(tender: Tender): string {
  return `${TIER_RANK[tender.relevance.tier]}:${calendarDateBucket(tender.submissionDeadline)}`;
}

/**
 * Orders `tenders` for a first impression: the per-industry picks first, then
 * every other row by size and deadline. Nothing is dropped — callers slice.
 */
export function orderIndustryShowcase(tenders: Tender[], perIndustry = SHOWCASE_PER_INDUSTRY): Tender[] {
  const ranked = tenders.slice().sort(compareBySizeThenDeadline);
  const picked = new Set<string>();
  const picks: Tender[] = [];

  for (const industry of ALL_INDUSTRIES) {
    const pool = ranked.filter((tender) => !picked.has(tender.slug) && tender.industries.includes(industry));
    const chosen: Tender[] = [];
    for (const tender of pool) {
      if (chosen.length >= perIndustry) break;
      // A second pick from another country when one of the same size exists,
      // so an industry's pair is not two rows from one portal.
      if (
        chosen.length > 0 &&
        chosen.some((pick) => pick.country === tender.country) &&
        pool.some(
          (other) =>
            !chosen.includes(other) &&
            other.country !== tender.country &&
            !chosen.some((pick) => pick.country === other.country) &&
            other.relevance.tier === tender.relevance.tier,
        )
      ) {
        continue;
      }
      chosen.push(tender);
    }
    // The country preference skipped rows; top up if the industry still has room.
    for (const tender of pool) {
      if (chosen.length >= perIndustry) break;
      if (!chosen.includes(tender)) chosen.push(tender);
    }
    for (const tender of chosen) {
      picked.add(tender.slug);
      picks.push(tender);
    }
  }

  const head = interleaveCountriesWithinEqualGroups(
    picks.sort(compareBySizeThenDeadline),
    (tender) => String(TIER_RANK[tender.relevance.tier]),
  );
  const rest = interleaveCountriesWithinEqualGroups(
    ranked.filter((tender) => !picked.has(tender.slug)),
    sizeAndDayKey,
  );
  return [...head, ...rest];
}
