import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { discoverComprasMxVigente } from "@/lib/ingestion/discover-comprasmx-vigente";

/**
 * Backs the "LicitIA 刷新" section's "发现新标书" button
 * (app/admin/import-tenders/, components/admin/LicitiaRefreshPanel.tsx).
 * Can take a while (downloads LicitIA's full bulk corpus, then one detail
 * lookup per newly-discovered procedure) — this stays a single synchronous
 * request/response since this runs on the admin's own `next dev` server,
 * not a rate-limited serverless function, same posture as the other
 * live-fetch admin routes (import-pemex, import-dof).
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; months?: number };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await discoverComprasMxVigente(supabase, { write: body.write === true, months: body.months });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
