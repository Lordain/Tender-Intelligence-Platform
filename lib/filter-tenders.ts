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
