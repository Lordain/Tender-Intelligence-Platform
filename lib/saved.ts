"use client";

import { useCallback, useEffect, useState } from "react";

const SAVED_TENDERS_KEY = "tender-intelligence:saved-tenders";
const SAVED_SEARCHES_KEY = "tender-intelligence:saved-searches";

function readList<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Saved tenders/searches live in localStorage until Phase 4 (Auth) adds a
 * per-user profiles table — at that point this hook's storage swaps to
 * Supabase without changing the components that call it.
 */
export function useSavedTenderIds() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    // Deliberately syncing from localStorage post-mount to avoid an SSR/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(readList<string>(SAVED_TENDERS_KEY));
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeList(SAVED_TENDERS_KEY, next);
      return next;
    });
  }, []);

  return { savedIds: ids, isSaved, toggle };
}

export type SavedSearch = {
  id: string;
  name: string;
  /** Relative URL (e.g. "/tenders?q=...&industry=Energy&status=open") that replays this search. */
  href: string;
  /** When enabled, tenders published after lastCheckedAt matching this search surface in the notification bell. */
  alertEnabled: boolean;
  createdAt: string;
  /** Tenders created at or before this timestamp are treated as already seen. Advances via markSearchChecked. */
  lastCheckedAt: string;
};

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearches(readList<SavedSearch>(SAVED_SEARCHES_KEY));
  }, []);

  const addSearch = useCallback((search: Omit<SavedSearch, "id" | "createdAt" | "lastCheckedAt">) => {
    setSearches((prev) => {
      const now = new Date().toISOString();
      const next = [...prev, { ...search, id: crypto.randomUUID(), createdAt: now, lastCheckedAt: now }];
      writeList(SAVED_SEARCHES_KEY, next);
      return next;
    });
  }, []);

  const removeSearch = useCallback((id: string) => {
    setSearches((prev) => {
      const next = prev.filter((search) => search.id !== id);
      writeList(SAVED_SEARCHES_KEY, next);
      return next;
    });
  }, []);

  const toggleAlert = useCallback((id: string) => {
    setSearches((prev) => {
      const next = prev.map((search) =>
        search.id === id ? { ...search, alertEnabled: !search.alertEnabled } : search,
      );
      writeList(SAVED_SEARCHES_KEY, next);
      return next;
    });
  }, []);

  const markSearchesChecked = useCallback((ids: string[], checkedAt = new Date().toISOString()) => {
    setSearches((prev) => {
      const idSet = new Set(ids);
      const next = prev.map((search) =>
        idSet.has(search.id) ? { ...search, lastCheckedAt: checkedAt } : search,
      );
      writeList(SAVED_SEARCHES_KEY, next);
      return next;
    });
  }, []);

  return { searches, addSearch, removeSearch, toggleAlert, markSearchesChecked };
}
