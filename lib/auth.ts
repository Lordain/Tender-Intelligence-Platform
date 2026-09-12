"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

type AuthState = { user: User | null; loading: boolean };

/**
 * Stable reference, returned before the real session is known and as the
 * server snapshot — useSyncExternalStore requires getSnapshot to return an
 * identical reference for unchanged state, and the server/hydration render
 * must agree with the first client render.
 */
const INITIAL: AuthState = { user: null, loading: SUPABASE_CONFIGURED };

/**
 * ONE shared auth state for the whole app, not one per hook instance
 * (2026-09-06). supabase.auth.getUser() is a real network round-trip to
 * the auth server every time it's called — unlike getSession(), which
 * reads local storage — and this hook is called from SaveTenderButton,
 * which renders once per tender card. A single page of /tenders is 28
 * cards, so every visit fired 28+ identical /auth/v1/user requests, which
 * the browser's per-host connection limit then serialised into a visible
 * multi-second staircase (confirmed in a real Network panel: ~1 kB each,
 * ~80 ms apart, all from this file). They now share one request and one
 * onAuthStateChange subscription.
 */
let state: AuthState = INITIAL;
const listeners = new Set<() => void>();
let started = false;

function setState(next: AuthState) {
  // Emit only on a real change. Supabase reports the same signed-in user
  // more than once by design — getUser() resolves, then onAuthStateChange
  // delivers INITIAL_SESSION, then TOKEN_REFRESHED arrives roughly hourly
  // — and each delivery carries a NEW user object. Without this check,
  // every consumer holding a `[user]` effect dependency refetches on each
  // one: AuthNav re-requested /api/admin/whoami three times per page load
  // for a user whose identity never changed (seen in a real Network
  // capture). Identity and loading are the only things this store's
  // consumers actually branch on.
  if (next.loading === state.loading && next.user?.id === state.user?.id) return;
  state = next;
  for (const listener of listeners) listener();
}

function start() {
  if (started || !SUPABASE_CONFIGURED) return;
  started = true;

  const supabase = getSupabaseBrowserClient();
  supabase.auth.getUser().then(({ data }) => setState({ user: data.user, loading: false }));
  // Never unsubscribed: this subscription belongs to the module, not to
  // any one component, and lives as long as the page does. Tearing it
  // down when the last consumer unmounts would only mean re-establishing
  // it (and re-fetching) on the next navigation.
  supabase.auth.onAuthStateChange((_event, session) => setState({ user: session?.user ?? null, loading: false }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Auth state is read client-side (rather than server-side via cookies in the
 * root layout) so pages can stay statically prerendered — reading the
 * session in a Server Component would force the whole app into dynamic
 * rendering. Reacts live to sign-in/out via onAuthStateChange, so callers
 * don't need router.refresh() after auth actions.
 */
export function useUser() {
  const { user, loading } = useSyncExternalStore(subscribe, () => state, () => INITIAL);

  const logout = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) return;
    await getSupabaseBrowserClient().auth.signOut();
  }, []);

  return { user, loading, logout, supabaseConfigured: SUPABASE_CONFIGURED };
}
