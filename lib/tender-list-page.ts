import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { filterTenders, isSortKey, sortTenders } from "@/lib/filter-tenders";

export const TENDER_PAGE_SIZE = 20;

const AVAILABLE_COUNTRIES = ["Mexico", "Colombia"] as const;
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
>;

export type TenderListPageData = {
  tenders: TenderListItem[];
  totalResults: number;
  totalPages: number;
  currentPage: number;
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
 * only one 20-row page is serialized into the browser's React payload.
 */
export function buildTenderListPage(
  allTenders: Tender[],
  params: TenderListSearchParams,
  now = new Date(),
): TenderListPageData {
  const query = firstValue(params.q) ?? "";
  const countryParam = firstValue(params.country);
  const countries = countryParam ? parseList(countryParam) : [...AVAILABLE_COUNTRIES];
  const industries = parseList(firstValue(params.industry));
  const industryMatchMode = firstValue(params.industryMode) === "all" ? "all" : "any";
  const scopeTypes = parseList(firstValue(params.scope)) as TenderScopeType[];
  const statusParam = firstValue(params.status);
  const statuses = (statusParam === "none" ? [] : parseList(statusParam)) as TenderStatus[];
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
  const sorted = sortTenders(viewed, sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / TENDER_PAGE_SIZE));
  const requestedPage = Math.max(1, Number(firstValue(params.page)) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * TENDER_PAGE_SIZE;

  return {
    tenders: sorted.slice(offset, offset + TENDER_PAGE_SIZE).map(toTenderListItem),
    totalResults: sorted.length,
    totalPages,
    currentPage,
    siteTenderCount: allTenders.filter((tender) => tender.status !== "awarded" && tender.status !== "cancelled").length,
    newTodayCount,
    upcomingCount,
  };
}
