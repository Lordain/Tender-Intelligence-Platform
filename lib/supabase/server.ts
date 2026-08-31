import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

/**
 * Server-only admin client (service role — bypasses RLS). Used for reading
 * public tender data and for scripts/seed-supabase.ts, not for anything
 * user-scoped (see lib/supabase/server-client.ts for that). Returns null
 * when the env vars aren't configured, so callers can fall back to bundled
 * mock data instead of crashing — the app runs with zero external
 * dependencies until a real project is connected.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
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
