import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importBoliviaPaste } from "@/lib/ingestion/import-bolivia-paste";
import { BOLIVIA_KEEP_TIERS, type BoliviaKeepTier } from "@/lib/ingestion/bolivia-paste-result";
import { logAdminAlert } from "@/lib/admin-alerts";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";
import { revalidateTenders } from "@/lib/cache-tags";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";

/**
 * The 玻利维亚 tab's 「SICOES 粘贴导入」 (user, 2026-10-09). Nothing is fetched:
 * the text is what the admin copied from SICOES in their own browser. See
 * lib/ingestion/import-bolivia-paste.ts.
 *
 * Bolivia opened 2026-10-10, so a write drops the public list's cache like
 * every other country's import.
 */
const MAX_TEXT = 300_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; write?: boolean; keep?: Record<string, string> };
  const keep: Record<string, BoliviaKeepTier> = {};
  for (const [cuce, tier] of Object.entries(body.keep ?? {})) if ((BOLIVIA_KEEP_TIERS as readonly string[]).includes(tier)) keep[cuce] = tier as BoliviaKeepTier;
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 SICOES 项目详情页（Ver Ficha）的内容。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请一次贴不超过几十个项目。" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await importBoliviaPaste(supabase, text, { write: body.write === true, keep });
    if (body.write === true) {
      // The public list is cached; drop it so this import shows up now.
      revalidateTenders();
      await markManualTaskDone(supabase, "bolivia-sicoes", `粘贴 ${result.rows.length} 个项目，写入 ${result.written ?? 0} 条`);
    }
    return NextResponse.json(result);
  } catch (err) {
    if (body.write === true && !(err instanceof PasteInputError)) await logAdminAlert(supabase, "import-bolivia-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
