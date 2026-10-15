import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { importUruguayPaste } from "@/lib/ingestion/import-uruguay-paste";
import { URUGUAY_KEEP_TIERS, type ArceLink, type UruguayKeepTier } from "@/lib/ingestion/uruguay-paste-result";
import { logAdminAlert } from "@/lib/admin-alerts";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";
import { revalidateTenders } from "@/lib/cache-tags";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";

/**
 * The 乌拉圭 tab's 「ARCE 列表粘贴导入」 (user, 2026-10-15). Nothing is fetched:
 * the text and the detail links are what the admin copied from ARCE's list
 * in their own browser. See lib/ingestion/import-uruguay-paste.ts.
 */
const MAX_TEXT = 600_000;
const MAX_LINKS = 2_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; write?: boolean; links?: unknown; keep?: Record<string, string> };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 ARCE「Llamados vigentes」列表页的内容。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  const links: ArceLink[] = Array.isArray(body.links)
    ? body.links
        .slice(0, MAX_LINKS)
        .filter((link): link is ArceLink => typeof link?.purchaseId === "string" && /^\d{1,12}$/.test(link.purchaseId) && typeof link?.label === "string")
        .map((link) => ({ label: link.label.slice(0, 500), purchaseId: link.purchaseId }))
    : [];
  const keep: Record<string, UruguayKeepTier> = {};
  for (const [id, tier] of Object.entries(body.keep ?? {})) if (/^\d{1,12}$/.test(id) && (URUGUAY_KEEP_TIERS as readonly string[]).includes(tier)) keep[id] = tier as UruguayKeepTier;

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await importUruguayPaste(supabase, text, { write: body.write === true, links, keep });
    if (body.write === true) {
      // The public list is cached; drop it so this import shows up now.
      revalidateTenders();
      await markManualTaskDone(supabase, "uruguay-arce", `粘贴 ${result.rows.length} 个公开/重点简易招标，写入 ${result.written ?? 0} 条`);
    }
    return NextResponse.json(result);
  } catch (err) {
    if (body.write === true && !(err instanceof PasteInputError)) await logAdminAlert(supabase, "import-uruguay-paste", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
