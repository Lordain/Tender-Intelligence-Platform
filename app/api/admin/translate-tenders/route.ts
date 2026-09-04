import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { translateAllTenders } from "@/lib/ingestion/translate-all-tenders";

/**
 * Web-form counterpart to `npm run translate:tenders` (see the "翻译所有
 * 标题" button on app/admin/import-tenders/page.tsx) — same shared
 * lib/ingestion/translate-all-tenders.ts function the CLI script uses.
 *
 * A real --write run over hundreds of untranslated tenders makes many
 * sequential Anthropic API calls and can run for minutes — pass a small
 * `limit` from the form for a single request that stays comfortably
 * under any reverse-proxy/serverless timeout; run it again (already-
 * translated tenders are skipped) to keep chipping away at the rest.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set. See .env.example." }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; limit?: number };

  try {
    const result = await translateAllTenders(supabase, { write: body.write === true, limit: body.limit });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
