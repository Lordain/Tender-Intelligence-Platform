import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { parseCfeListPaste, screenCfeListRow, type CfeListScreenResponse } from "@/lib/ingestion/cfe-list-screen";

/**
 * The 墨西哥 tab's 「CFE 列表初筛」: the search results copied from CFE's
 * micrositio, judged by CFE's rules from the list alone. Read-only — it
 * writes nothing and fetches nothing; the database is read only to mark the
 * numbers already on the platform. See lib/ingestion/cfe-list-screen.ts.
 */
const MAX_TEXT = 1_000_000;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "请先粘贴 CFE 网站的搜索结果列表。" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "粘贴的内容太长，请分几次贴。" }, { status: 400 });

  const listed = parseCfeListPaste(text);
  if (listed.length === 0) {
    return NextResponse.json(
      { error: "没有识别到 CFE 编号（CFE-0000-XXXXX-0000-2026）——请从列表的表头开始，连同各行一起复制。如果贴的是单个项目的详情页，请用下面的「CFE 网站粘贴导入」。" },
      { status: 400 },
    );
  }

  const existing = new Map<string, string>();
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    const numbers = listed.map((row) => row.number);
    for (let at = 0; at < numbers.length; at += 200) {
      const { data, error } = await supabase.from("tenders").select("slug,tender_number").in("tender_number", numbers.slice(at, at + 200));
      if (error) return NextResponse.json({ error: `无法核对是否已导入过：${error.message}` }, { status: 500 });
      for (const row of (data ?? []) as { slug: string; tender_number: string }[]) existing.set(row.tender_number, row.slug);
    }
  }

  const rows = listed.map((row) => screenCfeListRow(row, existing.get(row.number)));
  const response: CfeListScreenResponse = { rows, total: rows.length };
  return NextResponse.json(response);
}
