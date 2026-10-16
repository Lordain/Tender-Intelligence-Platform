import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importGuatemalaDetails } from "@/lib/ingestion/import-guatemala-paste";
import { GUATEMALA_KEEP_TIERS, type GuatemalaDetailPaste, type GuatemalaKeepTier } from "@/lib/ingestion/guatemala-paste-result";
import { logAdminAlert } from "@/lib/admin-alerts";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { cleanGuatecomprasLinks } from "@/lib/ingestion/guatemala-paste-input";

/**
 * The 危地马拉 tab's 「Guatecompras 详情页粘贴导入」 (user, 2026-10-16: A). Each
 * paste is a call's page the admin copied in their own browser, with the
 * links its HTML carried. See lib/ingestion/import-guatemala-paste.ts.
 *
 * Guatemala is staged (lib/staged-countries.ts): a write lands in the admin
 * pages only, so no public cache needs dropping.
 */
const MAX_TEXT = 300_000;
const MAX_PASTES = 50;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { pastes?: unknown; write?: boolean; keep?: Record<string, string> };
  const pastes: GuatemalaDetailPaste[] = (Array.isArray(body.pastes) ? body.pastes : [])
    .slice(0, MAX_PASTES)
    .filter((paste) => typeof paste?.text === "string" && paste.text.trim())
    .map((paste) => ({ text: String(paste.text), links: cleanGuatecomprasLinks(paste.links) }));
  if (pastes.length === 0) return NextResponse.json({ error: "请先粘贴 Guatecompras 项目详情页的内容。" }, { status: 400 });
  if (pastes.reduce((sum, paste) => sum + paste.text.length, 0) > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  const keep: Record<string, GuatemalaKeepTier> = {};
  for (const [nog, tier] of Object.entries(body.keep ?? {})) if (/^\d{5,12}$/.test(nog) && (GUATEMALA_KEEP_TIERS as readonly string[]).includes(tier)) keep[nog] = tier as GuatemalaKeepTier;

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await importGuatemalaDetails(supabase, pastes, { write: body.write === true, keep });
    if (body.write === true) await markManualTaskDone(supabase, "guatemala-guatecompras", `粘贴 ${result.rows.length} 个项目详情页，写入 ${result.written ?? 0} 条`);
    return NextResponse.json(result);
  } catch (err) {
    if (body.write === true && !(err instanceof PasteInputError)) await logAdminAlert(supabase, "import-guatemala-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
