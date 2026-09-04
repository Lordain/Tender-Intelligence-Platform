import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestColombia } from "@/lib/ingestion/ingest-colombia";
import { logAdminAlert } from "@/lib/admin-alerts";

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as { months?: number; maxPages?: number; write?: boolean; fetchDocuments?: boolean };
  const months = Number.isFinite(body.months) ? Number(body.months) : 2;
  const maxPages = Number.isFinite(body.maxPages) ? Number(body.maxPages) : 20;
  const write = body.write === true;
  const fetchDocuments = body.fetchDocuments === true;

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  try {
    const result = await ingestColombia(supabase!, { months, maxPages, write, fetchDocuments });
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "import-colombia", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
