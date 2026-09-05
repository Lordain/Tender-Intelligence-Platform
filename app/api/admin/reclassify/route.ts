import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { reclassifyTenders } from "@/lib/ingestion/reclassify-tenders";

/**
 * Backs the admin "重新分类" button (app/admin/import-tenders/) — re-runs
 * lib/relevance.ts's current ruleset against every already-ingested
 * tender. Only needed after a relevance-rule change (a new keyword, a
 * threshold change, ...), not a routine/frequent operation — but per the
 * user's explicit ask (2026-09-04, "以后我每次都得用 terminal 执行 write
 * 吗？"), no longer requires opening a terminal either way.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await reclassifyTenders(supabase, { write: body.write === true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
