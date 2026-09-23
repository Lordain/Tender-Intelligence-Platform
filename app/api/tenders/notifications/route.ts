import { NextResponse, type NextRequest } from "next/server";
import type { Locale, TenderScopeType, TenderStatus } from "@/types/tender";
import { filterTenders, type TenderFilterOptions } from "@/lib/filter-tenders";
import { getCachedTenderList } from "@/lib/tenders";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { canViewCountry, canUseTenderListMemberFeatures } from "@/lib/access-control";
import { toNotificationTender } from "@/lib/tender-list-page";

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

/**
 * Match saved searches server-side so the header never receives the complete
 * tender database.
 *
 * Deliberately still answers a GUEST rather than rejecting one: saved searches
 * live in localStorage and the bell renders for logged-out visitors, so a 401
 * here would break a working feature to protect data that simply should not
 * have been in the response. The role decides the projection instead — the
 * same shape /tenders serves the same viewer.
 *
 * `searchPublicFieldsOnly` matters as much as the projection does. Without it
 * this endpoint answered keyword queries against `title.es`, the buyer and the
 * procurement number: a visitor could not read those fields, but could ask
 * whether a given Spanish phrase matched anything and page through what did,
 * which is the same disclosure one question at a time. app/tenders/page.tsx
 * has always set this for non-members; this route is the second reader of the
 * same list and was missing it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { searches?: unknown[] } | null;
  const searches = (body?.searches ?? []).filter(isSavedSearchInput).slice(0, MAX_SEARCHES);
  if (searches.length === 0) return NextResponse.json([]);

  const entitlement = await getViewerEntitlement();
  const memberView = canUseTenderListMemberFeatures(entitlement.role);
  const tenders = await getCachedTenderList();
  const locale: Locale = "zh";
  const items = searches.flatMap((search) =>
    filterTenders(tenders, { ...parseFiltersFromHref(search.href), searchPublicFieldsOnly: !memberView }, locale)
      .filter((tender) => tender.createdAt > search.lastCheckedAt)
      .map((tender) => ({
        tender: toNotificationTender(tender, { memberView: memberView && canViewCountry(entitlement, tender.country) }),
        searchId: search.id,
        searchName: search.name,
      })),
  )
    .sort((a, b) => b.tender.createdAt.localeCompare(a.tender.createdAt))
    .slice(0, MAX_NOTIFICATIONS);

  return NextResponse.json(items);
}
