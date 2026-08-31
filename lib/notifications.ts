"use client";

import { useMemo } from "react";
import type { Locale, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { filterTenders, type TenderFilterOptions } from "@/lib/filter-tenders";
import { useSavedSearches, type SavedSearch } from "@/lib/saved";
import { useLocale } from "@/lib/i18n";

export type NotificationItem = {
  tender: Tender;
  searchId: string;
  searchName: string;
};

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

/** A tender "counts" for a search once it exists in the database (createdAt) after that search last checked. */
export function computeNotifications(
  tenders: Tender[],
  searches: SavedSearch[],
  locale: Locale,
): NotificationItem[] {
  const items: NotificationItem[] = [];

  for (const search of searches) {
    if (!search.alertEnabled) continue;
    const matches = filterTenders(tenders, parseFiltersFromHref(search.href), locale);
    for (const tender of matches) {
      if (tender.createdAt > search.lastCheckedAt) {
        items.push({ tender, searchId: search.id, searchName: search.name });
      }
    }
  }

  return items.sort((a, b) => b.tender.createdAt.localeCompare(a.tender.createdAt));
}

export function useNotifications(tenders: Tender[]) {
  const { locale } = useLocale();
  const { searches, markSearchesChecked } = useSavedSearches();

  const items = useMemo(
    () => computeNotifications(tenders, searches, locale),
    [tenders, searches, locale],
  );

  function markAllRead() {
    const ids = [...new Set(items.map((item) => item.searchId))];
    if (ids.length > 0) markSearchesChecked(ids);
  }

  return { items, unreadCount: items.length, markAllRead };
}
