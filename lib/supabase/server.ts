import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Server-only admin client (service role — bypasses RLS), for use from
 * Next.js server code (Server Components, Route Handlers). Used for reading
 * public tender data, not for anything user-scoped (see
 * lib/supabase/server-client.ts for that). Returns null when the env vars
 * aren't configured, so callers can fall back to bundled mock data instead
 * of crashing — the app runs with zero external dependencies until a real
 * project is connected.
 *
 * Standalone scripts (scripts/*.ts) should import createSupabaseAdminClient
 * from lib/supabase/admin-client.ts directly instead of this file — see
 * that file's comment for why.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  return createSupabaseAdminClient();
}
