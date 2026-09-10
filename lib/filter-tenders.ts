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
      // title/summary/buyer/tenderNumber, none of which necessarily contain the
      // same text as the slug (e.g. Proyectos Estratégicos MX's slug is a
      // slugified transform of its own reference number, not identical to
      // the tenderNumber field's real formatting).
      const haystack = [
        localize(tender.title, locale),
        ...Object.values(tender.summary),
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

export function sortTenders(allTenders: Tender[], sortKey: SortKey = DEFAULT_SORT, now = Date.now()): Tender[] {
  const sorted = [...allTenders];

  switch (sortKey) {
    case "deadline_asc": {
      const deadlineOf = (tender: Tender) => {
        if (!tender.submissionDeadline) return null;
        const timestamp = new Date(tender.submissionDeadline).getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
      };
      const priorityOf = (tender: Tender, deadline: number | null) => {
        const isFuture = deadline !== null && deadline >= now;
        if (isFuture && (tender.status === "open" || tender.status === "clarification")) return 0;
        if (isFuture && tender.status === "planned") return 1;
        if (tender.status === "awarded") return 2;
        if (isFuture) return 3;
        return 4;
      };

      return sorted.sort((a, b) => {
        const aDeadline = deadlineOf(a);
        const bDeadline = deadlineOf(b);
        const priorityDifference = priorityOf(a, aDeadline) - priorityOf(b, bDeadline);
        if (priorityDifference !== 0) return priorityDifference;

        // Inside a live/future group, the actionable deadline is the useful
        // ordering. Historical/no-date rows fall back to newest publication
        // first instead of putting the oldest stale deadline at the top.
        if (aDeadline !== null && bDeadline !== null && aDeadline >= now && bDeadline >= now) {
          return aDeadline - bDeadline;
        }
        return b.publicationDate.localeCompare(a.publicationDate);
      });
    }
    case "publication_desc":
    default:
      return sorted.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  }
}
