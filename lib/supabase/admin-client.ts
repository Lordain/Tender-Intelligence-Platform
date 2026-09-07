import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedAdminClient: SupabaseClient | null | undefined;
let cachedReadClient: SupabaseClient | null | undefined;

/**
 * The actual admin (service-role) client logic, deliberately WITHOUT the
 * "server-only" package guard: that guard throws unconditionally under
 * plain Node/tsx execution (it only no-ops when a bundler sets the special
 * "react-server" export condition, which only Next.js's own build does) —
 * so it broke the standalone CLI scripts (scripts/*.ts) that need this
 * client outside of Next.js entirely. lib/supabase/server.ts re-exports
 * the read half for the app (with the guard, since that half genuinely
 * only ever runs in Next.js's server bundle); scripts import straight
 * from here.
 */

function build(key: string | undefined): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Service role ONLY — returns null when SUPABASE_SERVICE_ROLE_KEY is unset,
 * exactly as it already did for a missing URL.
 *
 * It used to fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY (2026-09-06: fixed).
 * That made a function named "admin client" hand back an anonymous one
 * whenever the service key was missing, and every caller here is a WRITER —
 * all 60-odd of them: every /api/admin route, both cron routes, every
 * ingestion script. Their writes then ran as `anon` and were either
 * rejected by RLS (reported to the admin as success, since almost none of
 * them checked the returned error) or, worse, accepted. The codebase was
 * already working around it: two call sites re-checked
 * process.env.SUPABASE_SERVICE_ROLE_KEY by hand because `supabase !== null`
 * didn't actually mean what its name said. Those checks are now redundant
 * and have been removed.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  if (cachedAdminClient !== undefined) return cachedAdminClient;
  cachedAdminClient = build(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return cachedAdminClient;
}

/**
 * Read-only public data (the tender list/detail and site settings behind
 * lib/db/tenders.ts and lib/db/site-settings.ts — nothing user-scoped and
 * nothing that writes). Service role only. Never use this to write.
 *
 * It used to fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY, which is what kept
 * the app browsable on a project configured with only NEXT_PUBLIC_* vars.
 * Migration 0023 ended that: it drops the "Public read access" policies on
 * tenders and its child tables so a direct anon REST query can no longer
 * bypass the app's guest/subscriber rules. RLS is enabled on all of them
 * (0001_init.sql), and a policy-denied select returns an EMPTY array rather
 * than an error — so the fallback would have served a silently empty site
 * with nothing in the logs and no failed request to point at. Returning
 * null instead sends callers back to the bundled mock data, which is
 * obviously not the real thing.
 */
export function createSupabaseReadClient(): SupabaseClient | null {
  if (cachedReadClient !== undefined) return cachedReadClient;
  cachedReadClient = build(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!cachedReadClient && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn(
      "[supabase] Supabase is configured but SUPABASE_SERVICE_ROLE_KEY is missing, so the site is serving bundled mock data. Since migration 0023 the anon key cannot read tenders.",
    );
  }
  return cachedReadClient;
}
