import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { importPeruSeaceList } from "@/lib/ingestion/ingest-peru-seace-list";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { markManualTaskDone } from "@/lib/ops/manual-tasks";

/**
 * The 秘鲁 tab's 「SEACE 导出清单」 upload — a Lista-Procesos.xls the admin
 * exported from SEACE's own search page. Works on Vercel: nothing here calls
 * a .gob.pe host, the file already holds the data. Same function as
 * `npm run ingest:peru-seace-list`.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  const write = form.get("write") === "true";

  try {
    const supabase = createSupabaseAdminClient();
    const result = await importPeruSeaceList(supabase, Buffer.from(await file.arrayBuffer()), { write });
    if (write) {
      revalidateTenders();
      await markManualTaskDone(supabase, "peru-seace", `上传 ${file.name}，写入 ${result.upsertedCount ?? 0} 条`);
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
