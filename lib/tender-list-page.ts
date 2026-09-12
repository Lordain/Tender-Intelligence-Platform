import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { ALL_INDUSTRIES, type IndustryKey } from "@/lib/industry";
import { ALL_SCOPE_TYPES } from "@/lib/tender-labels";
import { filterTenders, isSortKey, sortTenders } from "@/lib/filter-tenders";

export const TENDER_PAGE_SIZE = 20;
export const LOCKED_TENDER_PAGE_SIZE = 10;
export const DEFAULT_TENDER_LIST_STATUSES: TenderStatus[] = ["planned", "open", "clarification", "awarded"];

/**
 * Statuses a bidder can still act on — what 全站在招 counts.
 *
 * NOT the complement of "awarded + cancelled", which is what siteTenderCount
 * used to subtract: that left 已截止 (submission_closed) in, so the number
 * was neither the whole site nor the live pipeline, and matched no label.
 */
const LIVE_TENDER_STATUSES: TenderStatus[] = ["planned", "open", "clarification"];

/**
 * Countries the public list offers as a filter — and, because an absent
 * country param means "all of these", the countries the default feed shows
 * AT ALL. A country missing from this list is invisible on /tenders no matter
 * how many of its tenders are in the database, which is exactly what happened
 * to Peru between its first import and 2026-09-11.
 *
 * So this is the switch that turns a country on for users, and it belongs
 * next to a real connector: ALL_COUNTRIES (lib/tender-labels.ts) also carries
 * Brazil and Chile, which have no source yet and would only ever return zero.
 *
 * Exported because TenderExplorer draws the filter pills from the very same
 * list: two copies would let the pills and the server-side filter disagree,
 * and the failure mode of that is a country a user can tick but never see.
 */
export const AVAILABLE_COUNTRIES = ["Mexico", "Colombia", "Peru"] as const;
const PLATFORM_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type TenderListSearchParams = Record<string, string | string[] | undefined>;

/** Only fields rendered by a list card/reminder; full tender detail never crosses this page boundary. */
export type TenderListItem = Pick<
  Tender,
  | "id"
  | "slug"
  | "title"
  | "buyer"
  | "country"
  | "industries"
  | "status"
  | "estimatedValue"
  | "currency"
  | "submissionDeadline"
  // Carried purely so a list row can be marked as Obras por Impuestos
  // (isObrasPorImpuestos) — that mechanism is different enough from an
  // ordinary tender that finding out only after opening the detail page
  // wastes the click.
  | "sourceName"
>;

export type TenderListPageData = {
  tenders: TenderListItem[];
  totalResults: number;
  totalPages: number;
  currentPage: number;
  /**
   * Industry filter options, narrowed to the categories that actually have
   * tenders behind them right now.
   *
   * The taxonomy (ALL_INDUSTRIES) is aspirational — it carries tax, mining,
   * education and others that government procurement in these countries
   * either never tenders or that this platform's own exclude rules remove
   * on purpose. Offering all of them made most of the filter dead: every
   * click returned zero and read as a broken site rather than an empty
   * category (2026-09-11, user: 很多行业一个项目都没有).
   *
   * Computed from the UNFILTERED list, so choosing an industry never makes
   * its own checkbox disappear, and it reappears by itself the day a source
   * starts supplying that category — no hardcoded hide list to maintain.
   */
  availableIndustries: IndustryKey[];
  /**
   * Same reasoning as availableIndustries, for the 项目类型 filter: two of the
   * five scope types effectively never reach the feed (see ALL_SCOPE_TYPES),
   * and a checkbox that can only ever return nothing is worse than no
   * checkbox. Derived, not a hide list, so a hand-set or override-rescued
   * tender brings its option back by itself.
   */
  availableScopeTypes: TenderScopeType[];
  /**
   * Live opportunities across the WHOLE site, ignoring the viewer's filters —
   * the sidebar's 全站在招. Deliberately on a different basis from
   * newTodayCount/upcomingCount, which are scoped to the current filters
   * because clicking them filters the list to exactly that set.
   *
   * Two things it used to get wrong (2026-09-12):
   * - It counted `allTenders` raw, so every excluded-tier row was in the
   *   total. Those rows are screened out of every public surface by
   *   filterTenders — the site was advertising a catalogue including
   *   thousands of tenders no user can reach.
   * - It subtracted only awarded + cancelled, while the default feed INCLUDES
   *   awarded (DEFAULT_TENDER_LIST_STATUSES), so 当前结果 could legitimately
   *   come out LARGER than the site total sitting next to it.
   *
   * Now it runs the same filterTenders() gate the feed does, so it is always
   * a superset of totalResults on the status dimension and can never be
   * undercut by it.
   */
  siteTenderCount: number;
  newTodayCount: number;
  upcomingCount: number;
};

export function toTenderListItem(tender: Tender): TenderListItem {
  return {
    id: tender.id,
    slug: tender.slug,
    title: tender.title,
    buyer: tender.buyer,
    country: tender.country,
    industries: tender.industries,
    status: tender.status,
    estimatedValue: tender.estimatedValue,
    currency: tender.currency,
    submissionDeadline: tender.submissionDeadline,
    sourceName: tender.sourceName,
  };
}

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function parseList(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

/** Calendar-day key in the platform's business timezone, independent of the server timezone. */
function platformDateKey(value: string | number | Date): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = PLATFORM_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * Applies the public list's search, facets, views, sorting and pagination on
 * the server. The underlying shared list stays cached for five minutes, but
 * only the role-appropriate page (20 rows for members, 10 for locked
 * visitor/free previews) is serialized into the browser's React payload.
 */
export function buildTenderListPage(
  allTenders: Tender[],
  params: TenderListSearchParams,
  options: { now?: Date; pageSize?: number } = {},
): TenderListPageData {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? TENDER_PAGE_SIZE;
  const query = firstValue(params.q) ?? "";
  const countryParam = firstValue(params.country);
  const countries = countryParam ? parseList(countryParam) : [...AVAILABLE_COUNTRIES];
  const industries = parseList(firstValue(params.industry));
  const industryMatchMode = firstValue(params.industryMode) === "all" ? "all" : "any";
  const scopeTypes = parseList(firstValue(params.scope)) as TenderScopeType[];
  const statusParam = firstValue(params.status);
  const statuses = (statusParam === "none"
    ? []
    : statusParam !== null
      ? parseList(statusParam)
      : DEFAULT_TENDER_LIST_STATUSES) as TenderStatus[];
  const tierParam = firstValue(params.tier);
  const relevanceTiers = (tierParam === "none" ? [] : parseList(tierParam)) as TenderRelevanceTier[];
  const sortParam = firstValue(params.sort);
  const sort = isSortKey(sortParam) ? sortParam : "deadline_asc";
  const viewParam = firstValue(params.view);
  const view = viewParam === "new" || viewParam === "deadline" ? viewParam : null;

  const filtered = filterTenders(
    allTenders,
    { query, industries, industryMatchMode, scopeTypes, statuses, countries, relevanceTiers },
    "zh",
  );
  const presentIndustries = new Set(allTenders.flatMap((tender) => tender.industries));
  const availableIndustries = ALL_INDUSTRIES.filter((industry) => presentIndustries.has(industry));
  const presentScopeTypes = new Set(allTenders.map((tender) => tender.scopeType));
  const availableScopeTypes = ALL_SCOPE_TYPES.filter((scopeType) => presentScopeTypes.has(scopeType));

  const today = platformDateKey(now);
  const nowMs = now.getTime();
  const newTodayCount = filtered.filter((tender) => platformDateKey(tender.createdAt) === today).length;
  const upcomingCount = filtered.filter(
    (tender) => tender.submissionDeadline && new Date(tender.submissionDeadline).getTime() >= nowMs,
  ).length;

  const viewed = view === "new"
    ? filtered.filter((tender) => platformDateKey(tender.createdAt) === today)
    : view === "deadline"
      ? filtered.filter((tender) => tender.submissionDeadline && new Date(tender.submissionDeadline).getTime() >= nowMs)
      : filtered;
  const sorted = sortTenders(viewed, sort, nowMs);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const requestedPage = Math.max(1, Number(firstValue(params.page)) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * pageSize;

  return {
    tenders: sorted.slice(offset, offset + pageSize).map(toTenderListItem),
    totalResults: sorted.length,
    totalPages,
    currentPage,
    availableIndustries,
    availableScopeTypes,
    siteTenderCount: filterTenders(allTenders, { statuses: LIVE_TENDER_STATUSES }, "zh").length,
    newTodayCount,
    upcomingCount,
  };
}
