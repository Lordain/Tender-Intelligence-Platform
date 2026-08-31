"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * Auth state is read client-side (rather than server-side via cookies in the
 * root layout) so pages can stay statically prerendered — reading the
 * session in a Server Component would force the whole app into dynamic
 * rendering. Reacts live to sign-in/out via onAuthStateChange, so callers
 * don't need router.refresh() after auth actions.
 */
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;

    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function logout() {
    if (!SUPABASE_CONFIGURED) return;
    await getSupabaseBrowserClient().auth.signOut();
  }

  return { user, loading, logout, supabaseConfigured: SUPABASE_CONFIGURED };
}
