import type { Locale, Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { localize } from "@/lib/localize";

export type TenderFilterOptions = {
  query?: string;
  industries?: string[];
  scopeTypes?: TenderScopeType[];
  statuses?: TenderStatus[];
  countries?: string[];
  /** Filters to the selected relevance/scale tiers (see lib/relevance.ts) — e.g. flagship + significant only, to cut out the long tail of small routine tenders. Empty/omitted means no tier restriction. */
  relevanceTiers?: TenderRelevanceTier[];
  /** "Find fewer, find better": routine-service tenders are hidden by default (see lib/relevance.ts). No UI control exposes this right now — kept as a param rather than removed since the underlying tier still needs to not leak into the default view. */
  includeExcluded?: boolean;
};

export function filterTenders(
  allTenders: Tender[],
  { query, industries, scopeTypes, statuses, countries, relevanceTiers, includeExcluded }: TenderFilterOptions,
  locale: Locale,
): Tender[] {
  const normalizedQuery = query?.trim().toLowerCase();

  return allTenders.filter((tender) => {
    if (!includeExcluded && tender.relevance.tier === "excluded") return false;
    if (relevanceTiers && relevanceTiers.length > 0 && !relevanceTiers.includes(tender.relevance.tier)) {
      return false;
    }
    if (industries && industries.length > 0 && !tender.industries.some((i) => industries.includes(i))) {
      return false;
    }
    if (scopeTypes && scopeTypes.length > 0 && !scopeTypes.includes(tender.scopeType)) {
      return false;
    }
    if (statuses && statuses.length > 0 && !statuses.includes(tender.status)) {
      return false;
    }
    if (countries && countries.length > 0 && !countries.includes(tender.country)) {
      return false;
    }

    if (normalizedQuery) {
      const haystack = [
        localize(tender.title, locale),
        tender.buyer,
        tender.tenderNumber,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }

    return true;
  });
}

export const SORT_KEYS = ["publication_desc", "deadline_asc"] as const;

export type SortKey = (typeof SORT_KEYS)[number];

const DEFAULT_SORT: SortKey = "publication_desc";

export function isSortKey(value: string | null): value is SortKey {
  return SORT_KEYS.includes(value as SortKey);
}

export function sortTenders(allTenders: Tender[], sortKey: SortKey = DEFAULT_SORT): Tender[] {
  const sorted = [...allTenders];

  switch (sortKey) {
    case "deadline_asc":
      return sorted.sort((a, b) => {
        if (!a.submissionDeadline) return 1;
        if (!b.submissionDeadline) return -1;
        return a.submissionDeadline.localeCompare(b.submissionDeadline);
      });
    case "publication_desc":
    default:
      return sorted.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  }
}
