import { tenders } from "@/data/tenders";
import type { Locale, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { localize } from "@/lib/i18n";

export function getAllTenders(): Tender[] {
  return tenders;
}

export function getTenderBySlug(slug: string): Tender | undefined {
  return tenders.find((tender) => tender.slug === slug);
}

export type TenderFilterOptions = {
  query?: string;
  industry?: string;
  scopeType?: TenderScopeType;
  status?: TenderStatus;
};

export function filterTenders(
  allTenders: Tender[],
  { query, industry, scopeType, status }: TenderFilterOptions,
  locale: Locale,
): Tender[] {
  const normalizedQuery = query?.trim().toLowerCase();

  return allTenders.filter((tender) => {
    if (industry && tender.industry !== industry) return false;
    if (scopeType && tender.scopeType !== scopeType) return false;
    if (status && tender.status !== status) return false;

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
