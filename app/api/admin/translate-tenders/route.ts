import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { translateAllTenders } from "@/lib/ingestion/translate-all-tenders";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * Web-form counterpart to `npm run translate:tenders` (see the "翻译所有
 * 标题" button on app/admin/import-tenders/page.tsx) — same shared
 * lib/ingestion/translate-all-tenders.ts function the CLI script uses.
 *
 * A real --write run over hundreds of untranslated tenders makes many
 * sequential DashScope (Qwen) API calls and can run for minutes — pass a small
 * `limit` from the form for a single request that stays comfortably
 * under any reverse-proxy/serverless timeout; run it again (already-
 * translated tenders are skipped) to keep chipping away at the rest.
 */
/**
 * Model calls run in sequence and can take minutes. Without this the route
 * got the host's default limit and was cut off mid-run (2026-09-28: the panel
 * showed "Unexpected token 'A', \"An error o\"… is not valid JSON" — the host's
 * error page read as JSON). The pass itself stops starting batches at
 * STOP_AFTER_MS and reports what is left; the panel then calls again by
 * itself until nothing is left. 120 s, not 150: batches run three at a time
 * and one of 8 rows has taken well over two minutes, so the last one started
 * must still finish inside the 300.
 */
export const maxDuration = 300;
const STOP_AFTER_MS = 120_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  if (!process.env.DASHSCOPE_API_KEY) {
    return NextResponse.json({ error: "DASHSCOPE_API_KEY isn't set. See .env.example." }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; limit?: number };

  try {
    const result = await translateAllTenders(supabase, { write: body.write === true, limit: body.limit, stopAfterMs: STOP_AFTER_MS });
    if (result.failedCount && result.lastErrorMessage) {
      await logAdminAlert(supabase, "translate-tenders", new Error(result.lastErrorMessage));
    }
    // The public list is cached; drop it so this edit shows up now.
    revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "translate-tenders", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
