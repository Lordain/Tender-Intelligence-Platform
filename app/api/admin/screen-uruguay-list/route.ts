import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { screenUruguayList } from "@/lib/ingestion/import-uruguay-paste";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { cleanArceLinks } from "@/lib/ingestion/uruguay-paste-input";

/**
 * The 乌拉圭 tab's 「ARCE 列表初筛」 (user, 2026-10-15: 应该是2层设计吧？). The
 * list the admin copied from ARCE in their own browser, read with the same
 * rules as the daily import; nothing is fetched and nothing is written.
 */
const MAX_TEXT = 600_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; links?: unknown };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 ARCE「Llamados vigentes」列表页的内容。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  try {
    return NextResponse.json(await screenUruguayList(createSupabaseAdminClient(), text, cleanArceLinks(body.links)));
  } catch (err) {
    const status = err instanceof PasteInputError ? 400 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
