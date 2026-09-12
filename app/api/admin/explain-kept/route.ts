import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { explainKeptFromDb } from "@/lib/ingestion/explain-kept";

/**
 * Backs the 保留原因分析 panel on /admin/import-tenders — the web version of
 * `npm run explain:kept`, reading the live `tenders` table instead of a
 * reclassify CSV export. Read-only; nothing here writes.
 *
 * Works for every country, not just whichever one last produced a CSV: the
 * `country` filter is the same one the CLI takes as `--country=`.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    country?: unknown;
    examples?: unknown;
    signal?: unknown;
  };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await explainKeptFromDb(supabase, {
      country: typeof body.country === "string" ? body.country : undefined,
      examples: typeof body.examples === "number" && body.examples > 0 ? Math.min(body.examples, 50) : undefined,
      signal: typeof body.signal === "string" ? body.signal : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
