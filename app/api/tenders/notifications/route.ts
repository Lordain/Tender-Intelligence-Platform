import { NextResponse, type NextRequest } from "next/server";
import type { Locale, TenderScopeType, TenderStatus } from "@/types/tender";
import { filterTenders, type TenderFilterOptions } from "@/lib/filter-tenders";
import { getCachedTenderList } from "@/lib/tenders";

type SavedSearchInput = {
  id: string;
  name: string;
  href: string;
  alertEnabled: boolean;
  lastCheckedAt: string;
};

const MAX_SEARCHES = 20;
const MAX_NOTIFICATIONS = 50;

function parseFiltersFromHref(href: string): TenderFilterOptions {
  const queryString = href.split("?")[1] ?? "";
  const params = new URLSearchParams(queryString);
  return {
    query: params.get("q") ?? undefined,
    industries: params.get("industry")?.split(",").filter(Boolean),
    scopeTypes: params.get("scope")?.split(",").filter(Boolean) as TenderScopeType[] | undefined,
    statuses: params.get("status")?.split(",").filter(Boolean) as TenderStatus[] | undefined,
  };
}

function isSavedSearchInput(value: unknown): value is SavedSearchInput {
  if (!value || typeof value !== "object") return false;
  const search = value as Partial<SavedSearchInput>;
  return typeof search.id === "string"
    && typeof search.name === "string"
    && typeof search.href === "string"
    && search.alertEnabled === true
    && typeof search.lastCheckedAt === "string";
}

/** Match saved searches server-side so the header never receives the complete tender database. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { searches?: unknown[] } | null;
  const searches = (body?.searches ?? []).filter(isSavedSearchInput).slice(0, MAX_SEARCHES);
  if (searches.length === 0) return NextResponse.json([]);

  const tenders = await getCachedTenderList();
  const locale: Locale = "zh";
  const items = searches.flatMap((search) =>
    filterTenders(tenders, parseFiltersFromHref(search.href), locale)
      .filter((tender) => tender.createdAt > search.lastCheckedAt)
      .map((tender) => ({
        tender: {
          id: tender.id,
          slug: tender.slug,
          title: tender.title,
          publicationDate: tender.publicationDate,
          createdAt: tender.createdAt,
        },
        searchId: search.id,
        searchName: search.name,
      })),
  )
    .sort((a, b) => b.tender.createdAt.localeCompare(a.tender.createdAt))
    .slice(0, MAX_NOTIFICATIONS);

  return NextResponse.json(items);
}
