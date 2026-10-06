import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importCfePaste } from "@/lib/ingestion/import-cfe-paste";
import { logAdminAlert } from "@/lib/admin-alerts";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { revalidateTenders } from "@/lib/cache-tags";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";

/**
 * The 墨西哥 tab's 「CFE 网站粘贴导入」 (user, 2026-10-06: 有什么方法我可以快速
 * 导入CFE的吗？比如我直接复制整个页面). Nothing is fetched: the text is what the
 * admin copied from CFE's micrositio in their own browser. See
 * lib/ingestion/import-cfe-paste.ts.
 */
const MAX_TEXT = 200_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; write?: boolean };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 CFE 项目详情页的内容。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请一次贴不超过几十个项目。" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await importCfePaste(supabase, text, { write: body.write === true });
    if (body.write === true) {
      revalidateTenders();
      await markManualTaskDone(supabase, "cfe-micrositio", `粘贴 ${result.rows.length} 个项目，写入 ${result.written ?? 0} 条`);
    }
    return NextResponse.json(result);
  } catch (err) {
    // Something pasted wrong is the form's message, not a 系统告警.
    if (body.write === true && !(err instanceof PasteInputError)) await logAdminAlert(supabase, "import-cfe-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
