import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseReadClient } from "@/lib/supabase/admin-client";

/**
 * Server-only READ client for public tender data, for use from Next.js
 * server code (Server Components, Route Handlers). Not for anything
 * user-scoped (see lib/supabase/server-client.ts for that) and not for
 * writes — a write path must take createSupabaseAdminClient() directly,
 * which is service-role or nothing. Returns null when the env vars aren't
 * configured, so callers can fall back to bundled mock data instead of
 * crashing — the app runs with zero external dependencies until a real
 * project is connected.
 *
 * Standalone scripts (scripts/*.ts) should import createSupabaseAdminClient
 * from lib/supabase/admin-client.ts directly instead of this file — see
 * that file's comment for why.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  return createSupabaseReadClient();
}
