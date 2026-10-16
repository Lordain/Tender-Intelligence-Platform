import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importUruguayDetails } from "@/lib/ingestion/import-uruguay-paste";
import { URUGUAY_KEEP_TIERS, type ArceDetailPaste, type UruguayKeepTier } from "@/lib/ingestion/uruguay-paste-result";
import { logAdminAlert } from "@/lib/admin-alerts";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";
import { revalidateTenders } from "@/lib/cache-tags";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { cleanArceDocuments, cleanArceLinks } from "@/lib/ingestion/uruguay-paste-input";

/**
 * The 乌拉圭 tab's 「ARCE 详情页粘贴导入」 (user, 2026-10-15: 1层是录标书). Nothing
 * is fetched: each paste is a detail page the admin copied from ARCE in their
 * own browser, with the links the copied HTML carried (the call's id, its
 * pliego and clarifications). See lib/ingestion/import-uruguay-paste.ts.
 */
const MAX_TEXT = 300_000;
const MAX_PASTES = 50;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { pastes?: unknown; write?: boolean; keep?: Record<string, string>; known?: unknown };
  const pastes: ArceDetailPaste[] = (Array.isArray(body.pastes) ? body.pastes : [])
    .slice(0, MAX_PASTES)
    .filter((paste) => typeof paste?.text === "string" && paste.text.trim())
    .map((paste) => ({ text: String(paste.text), links: cleanArceLinks(paste.links), documents: cleanArceDocuments(paste.documents) }));
  if (pastes.length === 0) return NextResponse.json({ error: "请先粘贴 ARCE 项目详情页的内容。" }, { status: 400 });
  if (pastes.reduce((sum, paste) => sum + paste.text.length, 0) > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  const keep: Record<string, UruguayKeepTier> = {};
  for (const [id, tier] of Object.entries(body.keep ?? {})) if (/^\d{1,12}$/.test(id) && (URUGUAY_KEEP_TIERS as readonly string[]).includes(tier)) keep[id] = tier as UruguayKeepTier;

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await importUruguayDetails(supabase, pastes, { write: body.write === true, keep, known: cleanArceLinks(body.known) });
    if (body.write === true) {
      // The public list is cached; drop it so this import shows up now.
      revalidateTenders();
      await markManualTaskDone(supabase, "uruguay-arce", `粘贴 ${result.rows.length} 个项目详情页，写入 ${result.written ?? 0} 条`);
    }
    return NextResponse.json(result);
  } catch (err) {
    if (body.write === true && !(err instanceof PasteInputError)) await logAdminAlert(supabase, "import-uruguay-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
