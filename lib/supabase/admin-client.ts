import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

/**
 * The actual admin (service-role) client logic, deliberately WITHOUT the
 * "server-only" package guard: that guard throws unconditionally under
 * plain Node/tsx execution (it only no-ops when a bundler sets the special
 * "react-server" export condition, which only Next.js's own build does) —
 * so it broke the standalone CLI scripts (scripts/*.ts) that need this
 * client outside of Next.js entirely. lib/supabase/server.ts re-exports
 * this for the app (with the guard, since that half genuinely only ever
 * runs in Next.js's server bundle); scripts import straight from here.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}
