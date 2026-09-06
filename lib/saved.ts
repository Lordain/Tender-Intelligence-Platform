"use client";

import { useCallback, useSyncExternalStore } from "react";

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
 * ONE shared list per storage key, not one copy per hook instance
 * (2026-09-06). These hooks are called from components that render many
 * times on one page — useSavedTenderIds() runs once per SaveTenderButton,
 * i.e. once per tender card — and each instance used to hold its own
 * useState copy of the same list, hydrated by its own post-mount effect.
 *
 * That was a real bug, not just waste: toggling a bookmark updated only
 * the instance that was clicked. Every other instance kept its stale
 * copy until it remounted, so the "已收藏" reminder list further down the
 * same page didn't react to the card the user had just clicked. All
 * consumers now read and write the same store.
 *
 * The server snapshot is a stable empty array: server-rendered HTML can't
 * know what's in localStorage, so the hydration render has to agree that
 * it's empty and only then switch to the real value — which is what the
 * post-mount effect this replaces was working around by hand.
 */
const EMPTY: never[] = [];

function createListStore<T>(key: string) {
  // Read at module init on the client (never during the hydration render —
  // useSyncExternalStore serves getServerSnapshot for that, then re-renders
  // with this value once hydrated).
  let value: T[] = typeof window === "undefined" ? (EMPTY as T[]) : readList<T>(key);
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => value,
    getServer: () => EMPTY as T[],
    update(next: (current: T[]) => T[]) {
      value = next(value);
      writeList(key, value);
      for (const listener of listeners) listener();
    },
  };
}

const savedTendersStore = createListStore<string>(SAVED_TENDERS_KEY);

/**
 * Saved tenders/searches live in localStorage until Phase 4 (Auth) adds a
 * per-user profiles table — at that point this hook's storage swaps to
 * Supabase without changing the components that call it.
 */
export function useSavedTenderIds() {
  const ids = useSyncExternalStore(savedTendersStore.subscribe, savedTendersStore.get, savedTendersStore.getServer);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback((id: string) => {
    savedTendersStore.update((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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

const savedSearchesStore = createListStore<SavedSearch>(SAVED_SEARCHES_KEY);

export function useSavedSearches() {
  const searches = useSyncExternalStore(savedSearchesStore.subscribe, savedSearchesStore.get, savedSearchesStore.getServer);

  const addSearch = useCallback((search: Omit<SavedSearch, "id" | "createdAt" | "lastCheckedAt">) => {
    savedSearchesStore.update((prev) => {
      const now = new Date().toISOString();
      return [...prev, { ...search, id: crypto.randomUUID(), createdAt: now, lastCheckedAt: now }];
    });
  }, []);

  const removeSearch = useCallback((id: string) => {
    savedSearchesStore.update((prev) => prev.filter((search) => search.id !== id));
  }, []);

  const toggleAlert = useCallback((id: string) => {
    savedSearchesStore.update((prev) =>
      prev.map((search) => (search.id === id ? { ...search, alertEnabled: !search.alertEnabled } : search)),
    );
  }, []);

  const markSearchesChecked = useCallback((ids: string[], checkedAt = new Date().toISOString()) => {
    savedSearchesStore.update((prev) => {
      const idSet = new Set(ids);
      return prev.map((search) => (idSet.has(search.id) ? { ...search, lastCheckedAt: checkedAt } : search));
    });
  }, []);

  return { searches, addSearch, removeSearch, toggleAlert, markSearchesChecked };
}
