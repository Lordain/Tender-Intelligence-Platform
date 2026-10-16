import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { screenGuatemalaList } from "@/lib/ingestion/import-guatemala-paste";
import { PasteInputError } from "@/lib/ingestion/paste-input-error";
import { cleanGuatecomprasLinks } from "@/lib/ingestion/guatemala-paste-input";

/**
 * The 危地马拉 tab's 「Guatecompras 列表初筛」 (user, 2026-10-16: A). The list
 * the admin copied from Guatecompras in their own browser, read with the
 * platform's rules; nothing is fetched and nothing is written.
 */
const MAX_TEXT = 600_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string; links?: unknown };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 Guatecompras「Concursos vigentes」列表页的内容。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  try {
    return NextResponse.json(await screenGuatemalaList(createSupabaseAdminClient(), text, cleanGuatecomprasLinks(body.links)));
  } catch (err) {
    const status = err instanceof PasteInputError ? 400 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
