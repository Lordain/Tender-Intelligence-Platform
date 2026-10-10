import type { Tender } from "@/types/tender";
import { filterTenders } from "@/lib/filter-tenders";
import {
  parseTenderListFilters,
  rowHasMemberView,
  tenderListParamsFromHref,
  toNotificationTender,
  type NotificationTenderItem,
  type TenderListViewerRules,
} from "@/lib/tender-list-page";

export type SavedSearchInput = {
  id: string;
  name: string;
  href: string;
  alertEnabled: boolean;
  lastCheckedAt: string;
};

export type SavedSearchAlert = {
  tender: NotificationTenderItem;
  searchId: string;
  searchName: string;
};

export const MAX_SAVED_SEARCHES = 20;
export const MAX_SAVED_SEARCH_ALERTS = 50;

export function isSavedSearchInput(value: unknown): value is SavedSearchInput {
  if (!value || typeof value !== "object") return false;
  const search = value as Partial<SavedSearchInput>;
  return typeof search.id === "string"
    && typeof search.name === "string"
    && typeof search.href === "string"
    && search.alertEnabled === true
    && typeof search.lastCheckedAt === "string";
}

/**
 * The rows each saved search reminds about: what opening its link on /tenders
 * would list for this viewer, created since the search was last checked.
 *
 * Same filters (parseTenderListFilters — country, stage, scale, industries,
 * the "all" mode) and the same viewer rules (tenderListViewerRules — keyword
 * scope and the per-row member projection) as the list page, so a reminder
 * can neither point outside what the saved link shows nor be used to ask
 * about fields the list would not search for this viewer. Sorting and
 * pagination are the list's own business: reminders are newest-first,
 * capped at MAX_SAVED_SEARCH_ALERTS.
 */
export function matchSavedSearchAlerts(
  tenders: Tender[],
  searches: SavedSearchInput[],
  rules: TenderListViewerRules,
): SavedSearchAlert[] {
  return searches.slice(0, MAX_SAVED_SEARCHES).flatMap((search) =>
    filterTenders(tenders, { ...parseTenderListFilters(tenderListParamsFromHref(search.href)), searchPublicFieldsOnly: rules.searchPublicFieldsOnly, fullSearchCountries: rules.memberView ? rules.memberCountries : null })
      .filter((tender) => tender.createdAt > search.lastCheckedAt)
      .map((tender) => ({
        tender: toNotificationTender(tender, { memberView: rowHasMemberView(rules, tender.country) }),
        searchId: search.id,
        searchName: search.name,
      })),
  )
    .sort((a, b) => b.tender.createdAt.localeCompare(a.tender.createdAt))
    .slice(0, MAX_SAVED_SEARCH_ALERTS);
}
