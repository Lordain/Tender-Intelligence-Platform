import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestColombia, refreshColombiaTenders } from "@/lib/ingestion/ingest-colombia";
import { logAdminAlert } from "@/lib/admin-alerts";

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as { months?: number; maxPages?: number; write?: boolean; fetchDocuments?: boolean; mode?: "pull" | "refresh" };
  const write = body.write === true;

  const supabase = createSupabaseAdminClient();
  // refresh mode always needs Supabase (to look up already-tracked tender
  // numbers) even in a --write:false dry run — unlike "pull" mode, which
  // only touches Supabase once it's actually writing.
  if ((write || body.mode === "refresh") && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  try {
    if (body.mode === "refresh") {
      const result = await refreshColombiaTenders(supabase!, { write });
      return NextResponse.json(result);
    }

    const months = Number.isFinite(body.months) ? Number(body.months) : 2;
    const maxPages = Number.isFinite(body.maxPages) ? Number(body.maxPages) : 20;
    const fetchDocuments = body.fetchDocuments === true;
    const result = await ingestColombia(supabase!, { months, maxPages, write, fetchDocuments });
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "import-colombia", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
