import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { backfillMexicoDeadlines } from "@/lib/ingestion/backfill-mexico-deadlines";

/**
 * Backs the admin 「补交标截止日」 button (app/admin/import-tenders/mexico/)
 * — the same function `npm run backfill:mx-deadlines` runs, for the same
 * reason the 重新分类 button exists: the user should not have to open a
 * terminal to run a routine check (2026-09-04, "以后我每次都得用 terminal
 * 执行 write 吗？").
 *
 * Not a write by default. `write: true` is what fills the columns.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await backfillMexicoDeadlines(supabase, { write: body.write === true });
    // A filled deadline changes the overview card, the timeline AND the
    // status a tender is listed under, so the cached lists have to go.
    if (result.writtenCount > 0) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
