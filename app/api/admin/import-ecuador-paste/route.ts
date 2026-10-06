import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importEcuadorPaste } from "@/lib/ingestion/import-ecuador-paste";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 厄瓜多尔 tab's 「SOCE 粘贴导入」 (user, 2026-10-06). Nothing is fetched:
 * the text is what the admin copied from SOCE in their own browser. See
 * lib/ingestion/import-ecuador-paste.ts.
 *
 * Ecuador is staged (lib/staged-countries.ts), so a write lands in the admin
 * pages only and no public cache needs dropping.
 */
const MAX_TEXT = 200_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; write?: boolean };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 SOCE 项目详情页的内容。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请一次贴不超过几十个项目。" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    return NextResponse.json(await importEcuadorPaste(supabase, text, { write: body.write === true }));
  } catch (err) {
    if (body.write === true) await logAdminAlert(supabase, "import-ecuador-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
