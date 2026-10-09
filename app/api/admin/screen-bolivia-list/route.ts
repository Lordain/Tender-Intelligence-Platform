import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { parseBoliviaListPaste, screenBoliviaListRow, type BoliviaListScreenResponse } from "@/lib/ingestion/bolivia-list-screen";
import { BOLIVIA, boliviaSlug } from "@/lib/ingestion/bolivia-sicoes-paste";

/**
 * The 玻利维亚 tab's 「SICOES 列表初筛」: SICOES's Convocatorias results,
 * several pages pasted at once, judged from the list alone. Read-only — it
 * writes nothing and fetches nothing; the database is read only to mark the
 * CUCEs already on the platform. See lib/ingestion/bolivia-list-screen.ts.
 */
const MAX_TEXT = 1_000_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 SICOES 的搜索结果列表。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  const listed = parseBoliviaListPaste(text);
  if (listed.length === 0) {
    return NextResponse.json(
      { error: "没有识别到 CUCE（26-0000-00-0000000-1-1）——请从表头「CUCE」开始，连同各行一起复制。如果贴的是单个项目的详情页，请用下面的「SICOES 粘贴导入」。" },
      { status: 400 },
    );
  }

  const existing = new Map<string, string>();
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    const cuces = listed.map((row) => row.cuce);
    for (let at = 0; at < cuces.length; at += 200) {
      const chunk = cuces.slice(at, at + 200);
      const { data, error } = await supabase.from("tenders").select("slug,tender_number").eq("country", BOLIVIA).in("slug", chunk.map(boliviaSlug));
      if (error) return NextResponse.json({ error: `无法核对是否已导入过：${error.message}` }, { status: 500 });
      for (const row of (data ?? []) as { slug: string; tender_number: string }[]) existing.set(row.tender_number, row.slug);
    }
  }

  const now = new Date();
  const rows = listed.map((row) => screenBoliviaListRow(row, now, existing.get(row.cuce)));
  const response: BoliviaListScreenResponse = { rows, total: rows.length };
  return NextResponse.json(response);
}
