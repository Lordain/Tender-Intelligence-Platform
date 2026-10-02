import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { orderIndustryShowcase } from "@/lib/industry-showcase";
import { calendarDateBucket, interleaveCountriesWithinEqualGroups } from "@/lib/country-interleave";

export type TenderFilterOptions = {
  query?: string;
  /** Restrict keyword matching to approved Chinese public copy. */
  searchPublicFieldsOnly?: boolean;
  /**
   * Basic: the one country whose rows this viewer reads with member fields.
   * Those rows are searched in full even under searchPublicFieldsOnly — the
   * viewer sees their original-language title on the card, so a word from it
   * must find them. Every other country stays on public copy. See
   * tenderSearchText.
   */
  fullSearchCountry?: string | null;
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
    searchPublicFieldsOnly,
    fullSearchCountry,
    industries,
    industryMatchMode = "any",
    scopeTypes,
    statuses,
    countries,
    relevanceTiers,
    includeExcluded,
  }: TenderFilterOptions,
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
      const scope = searchPublicFieldsOnly && tender.country !== fullSearchCountry ? "public" : "full";
      const haystack = tenderSearchText(tender, scope);
      if (!haystack.includes(normalizedQuery)) return false;
    }

    return true;
  });
}

/**
 * Everything a keyword is matched against, lowercased (user, 2026-10-02: 搜索
 * 包括(中文+外语)标题、摘要、一句话总结).
 *
 * "full" — members, admins, and a Basic viewer's own country: the Chinese
 * title in all three forms (the full translation, the condensed one members
 * read in the list, the public one), the original-language title, the summary
 * in Chinese and in the source language plus its public form, the 一句话总结,
 * and the buyer, procurement number and slug (an admin pastes a slug from an
 * edit page: 2026-09-05).
 *
 * The title used to be `localize(title, "zh")` alone, so a Portuguese or
 * Spanish word from the original title — the line a member reads under the
 * Chinese one, and the words in the bid documents — found nothing unless the
 * summary happened to repeat it. The 一句话总结 was not searched at all.
 *
 * "public" — guests, lapsed accounts, and Basic outside its country: Chinese
 * copy only, as before. The original title, the source summary and the
 * 一句话总结 are member content (the 一句话总结 is paywalled analysis shown
 * only on admin-picked free previews); matching against them would let anyone
 * ask, one search at a time, whether a word appears in text they cannot see —
 * the leak the 2026-09-26 review closed. An untranslated row mirrors the source
 * into `zh`, which is why those copies are skipped here.
 */
export function tenderSearchText(tender: Tender, scope: "full" | "public"): string {
  const titleZh = tender.title.zh.trim();
  const summaryZh = tender.summary.zh.trim();
  const hasChineseTitle = titleZh !== "" && titleZh !== tender.title.es.trim();
  const hasChineseSummary = summaryZh !== "" && summaryZh !== tender.summary.es.trim();
  const parts =
    scope === "public"
      ? [
          hasChineseTitle ? titleZh : "",
          hasChineseTitle ? tender.titleZhShort : "",
          tender.titleZhPublic,
          hasChineseSummary ? summaryZh : "",
          tender.summaryZhPublic,
        ]
      : [
          ...Object.values(tender.title),
          tender.titleZhShort,
          tender.titleZhPublic,
          ...Object.values(tender.summary),
          tender.summaryZhPublic,
          tender.oneLineSummary,
          tender.buyer,
          tender.tenderNumber,
          tender.slug,
        ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

// deadline_desc added 2026-09-25 (user: 计划交标 … 增加：由远到近).
// recommended added 2026-10-02 and is /tenders' default — see sortTenders.
export const SORT_KEYS = ["publication_desc", "deadline_asc", "deadline_desc", "recommended"] as const;

export type SortKey = (typeof SORT_KEYS)[number];

const DEFAULT_SORT: SortKey = "publication_desc";

export function isSortKey(value: string | null): value is SortKey {
  return SORT_KEYS.includes(value as SortKey);
}

export function sortTenders(allTenders: Tender[], sortKey: SortKey = DEFAULT_SORT, now = Date.now()): Tender[] {
  const sorted = [...allTenders];

  switch (sortKey) {
    case "recommended": {
      // The first screen of /tenders (user, 2026-10-02 — 这是用户第一眼看到
      // 我们的入口): among the live opportunities, two per industry, 大型 then
      // 中型 first, countries interleaved (lib/industry-showcase.ts), then the
      // remaining live rows by size and deadline. Everything not biddable
      // today keeps the 由近到远 order behind them.
      const byDeadline = sortTenders(allTenders, "deadline_asc", now);
      const isLive = (tender: Tender) => {
        const deadline = tender.submissionDeadline ? new Date(tender.submissionDeadline).getTime() : NaN;
        return Number.isFinite(deadline) && deadline >= now && (tender.status === "open" || tender.status === "clarification");
      };
      return [...orderIndustryShowcase(byDeadline.filter(isLive)), ...byDeadline.filter((tender) => !isLive(tender))];
    }
    case "deadline_asc":
    case "deadline_desc": {
      // 由远到近 flips only the order WITHIN the live band: the groups stay in
      // the same order, so a far-off live tender still comes before any
      // closed one rather than the list opening on stale deadlines.
      const direction = sortKey === "deadline_desc" ? -1 : 1;
      const deadlineOf = (tender: Tender) => {
        if (!tender.submissionDeadline) return null;
        const timestamp = new Date(tender.submissionDeadline).getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
      };
      const priorityOf = (tender: Tender, deadline: number | null) => {
        const isFuture = deadline !== null && deadline >= now;
        // Open/clarification with a future deadline is the "live opportunity"
        // band. 即将招标 (an announcement, no deadline yet) comes right after
        // it: not biddable today, but ahead of anything already decided.
        if (isFuture && (tender.status === "open" || tender.status === "clarification")) return 0;
        if (tender.status === "planned") return 1;
        // 暂停中 (migration 0057): not biddable today but may resume, so it
        // sits with the announcements, ahead of anything already decided.
        if (tender.status === "suspended") return 2;
        if (tender.status === "awarded") return 3;
        if (isFuture) return 4;
        return 5;
      };

      const deadlineSorted = sorted.sort((a, b) => {
        const aDeadline = deadlineOf(a);
        const bDeadline = deadlineOf(b);
        const priorityDifference = priorityOf(a, aDeadline) - priorityOf(b, bDeadline);
        if (priorityDifference !== 0) return priorityDifference;

        // Inside a live/future group, the actionable deadline is the useful
        // ordering. Historical/no-date rows fall back to newest publication
        // first instead of putting the oldest stale deadline at the top.
        if (aDeadline !== null && bDeadline !== null && aDeadline >= now && bDeadline >= now) {
          return (aDeadline - bDeadline) * direction;
        }
        return b.publicationDate.localeCompare(a.publicationDate);
      });

      return interleaveCountriesWithinEqualGroups(deadlineSorted, (tender) => {
        const deadline = deadlineOf(tender);
        const priority = priorityOf(tender, deadline);
        if (deadline !== null && deadline >= now) {
          return `${priority}:deadline:${calendarDateBucket(tender.submissionDeadline)}`;
        }
        return `${priority}:publication:${calendarDateBucket(tender.publicationDate)}`;
      });
    }
    case "publication_desc":
    default:
      return interleaveCountriesWithinEqualGroups(
        sorted.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate)),
        (tender) => calendarDateBucket(tender.publicationDate),
      );
  }
}
