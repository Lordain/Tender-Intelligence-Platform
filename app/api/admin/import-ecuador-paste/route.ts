import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importEcuadorPaste } from "@/lib/ingestion/import-ecuador-paste";
import { logAdminAlert } from "@/lib/admin-alerts";
import { revalidateTenders } from "@/lib/cache-tags";

/**
 * The 厄瓜多尔 tab's 「SOCE 粘贴导入」 (user, 2026-10-06). Nothing is fetched:
 * the text is what the admin copied from SOCE in their own browser. See
 * lib/ingestion/import-ecuador-paste.ts.
 *
 * Ecuador opened 2026-10-06, so a write drops the public list's cache like
 * every other country's import.
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
    const result = await importEcuadorPaste(supabase, text, { write: body.write === true });
    // The public list is cached; drop it so this import shows up now.
    if (body.write === true) revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    if (body.write === true) await logAdminAlert(supabase, "import-ecuador-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
