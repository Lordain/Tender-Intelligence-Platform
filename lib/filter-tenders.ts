import type { Locale, Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { localize } from "@/lib/localize";

export type TenderFilterOptions = {
  query?: string;
  industries?: string[];
  /**
   * A tender can carry multiple industries.ts tags (e.g. a power-plant
   * SCADA upgrade is both "power" and "ict_telecom" — see
   * lib/industry.ts's header comment). Default "any" is standard
   * faceted-search OR semantics: check ICT and Power to see every
   * tender tagged with either one. "all" switches to AND — only
   * tenders carrying every selected tag — for when the user wants to
   * isolate genuine cross-sector combo projects (ICT + Power together)
   * from the larger single-sector pool that OR would otherwise mix in.
   */
  industryMatchMode?: "any" | "all";
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
  {
    query,
    industries,
    industryMatchMode = "any",
    scopeTypes,
    statuses,
    countries,
    relevanceTiers,
    includeExcluded,
  }: TenderFilterOptions,
  locale: Locale,
): Tender[] {
  const normalizedQuery = query?.trim().toLowerCase();

  return allTenders.filter((tender) => {
    if (!includeExcluded && tender.relevance.tier === "excluded") return false;
    if (relevanceTiers && relevanceTiers.length > 0 && !relevanceTiers.includes(tender.relevance.tier)) {
      return false;
    }
    if (industries && industries.length > 0) {
      const matchesIndustries =
        industryMatchMode === "all"
          ? industries.every((i) => tender.industries.includes(i))
          : tender.industries.some((i) => industries.includes(i));
      if (!matchesIndustries) return false;
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
      // tender.slug added (2026-09-05, real gap): an admin pasting a
      // tender's slug (visible on every /admin/tenders/[slug] edit page,
      // and in the public tender-detail URL itself) into this search box
      // got 0 results — the haystack never included it, only
      // title/buyer/tenderNumber, none of which necessarily contain the
      // same text as the slug (e.g. Proyectos Estratégicos MX's slug is a
      // slugified transform of its own reference number, not identical to
      // the tenderNumber field's real formatting).
      const haystack = [
        localize(tender.title, locale),
        tender.buyer,
        tender.tenderNumber,
        tender.slug,
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
