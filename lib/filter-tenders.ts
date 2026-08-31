import type { Locale, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { localize } from "@/lib/localize";

export type TenderFilterOptions = {
  query?: string;
  industries?: string[];
  scopeTypes?: TenderScopeType[];
  statuses?: TenderStatus[];
};

export function filterTenders(
  allTenders: Tender[],
  { query, industries, scopeTypes, statuses }: TenderFilterOptions,
  locale: Locale,
): Tender[] {
  const normalizedQuery = query?.trim().toLowerCase();

  return allTenders.filter((tender) => {
    if (industries && industries.length > 0 && !industries.includes(tender.industry)) {
      return false;
    }
    if (scopeTypes && scopeTypes.length > 0 && !scopeTypes.includes(tender.scopeType)) {
      return false;
    }
    if (statuses && statuses.length > 0 && !statuses.includes(tender.status)) {
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

export const SORT_KEYS = [
  "publication_desc",
  "deadline_asc",
  "value_desc",
  "value_asc",
] as const;

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
    case "value_desc":
      return sorted.sort((a, b) => (b.estimatedValue ?? -Infinity) - (a.estimatedValue ?? -Infinity));
    case "value_asc":
      return sorted.sort((a, b) => (a.estimatedValue ?? Infinity) - (b.estimatedValue ?? Infinity));
    case "publication_desc":
    default:
      return sorted.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  }
}
