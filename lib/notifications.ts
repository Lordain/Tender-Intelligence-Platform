"use client";

import { useEffect, useState } from "react";
import { useSavedSearches } from "@/lib/saved";

/**
 * Mirrors the projection in app/api/tenders/notifications/route.ts. One safe
 * Chinese display string, not the source LocalizedText the bell used to
 * receive and never render.
 */
type NotificationTender = {
  id: string;
  publicSlug: string;
  titleZh: string;
  publicationDate: string;
  createdAt: string;
};

export type NotificationItem = {
  tender: NotificationTender;
  searchId: string;
  searchName: string;
};

export function useNotifications() {
  const { searches, markSearchesChecked } = useSavedSearches();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const enabledSearches = searches.filter((search) => search.alertEnabled);
    const request = enabledSearches.length === 0
      ? Promise.resolve([] as NotificationItem[])
      : fetch("/api/tenders/notifications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ searches: enabledSearches }),
          signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error("Failed to load tender notifications");
          return response.json() as Promise<NotificationItem[]>;
        });

    request.then(setItems).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
    });
    return () => controller.abort();
  }, [searches]);

  function markAllRead() {
    const ids = [...new Set(items.map((item) => item.searchId))];
    if (ids.length > 0) markSearchesChecked(ids);
  }

  return { items, unreadCount: items.length, markAllRead };
}
