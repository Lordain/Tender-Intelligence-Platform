import { NextResponse } from "next/server";
import { revalidateTenders } from "@/lib/cache-tags";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { logAdminAlert } from "@/lib/admin-alerts";
import { refreshBrazilPncpStatuses } from "@/lib/ingestion/ingest-brazil";
import { refreshChileStatuses } from "@/lib/ingestion/ingest-chile";
import { refreshPeruOxiStatuses } from "@/lib/ingestion/ingest-peru";
import { refreshComprasMxStatuses } from "@/lib/ingestion/refresh-comprasmx-statuses";
import type { StatusRefreshResult } from "@/lib/ingestion/status-refresh";

/**
 * 刷新标书状态, by hand — the same refreshers the daily
 * cron:refresh-statuses and cron:peru-oxi jobs run (user, 2026-09-26: 自动&
 * 手动，刷新标书状态). Only the status column of tenders already stored
 * moves; see lib/ingestion/status-refresh.ts.
 *
 * JSON `{ source, write }` for a live refresh, or multipart with an OxI
 * all-states Excel (`file`) for ProInversión — the export a person downloads
 * with 状态 set to 全部, the fallback for the day the live export changes.
 */
export const maxDuration = 300;

type Source = "brazil" | "chile" | "mexico" | "oxi";
const SOURCES: Source[] = ["brazil", "chile", "mexico", "oxi"];

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  let source: Source;
  let write: boolean;
  let file: { buffer: Buffer; fileName: string } | undefined;
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) return NextResponse.json({ error: "没有收到文件" }, { status: 400 });
    source = "oxi";
    write = form.get("write") === "true";
    file = { buffer: Buffer.from(await upload.arrayBuffer()), fileName: upload.name };
  } else {
    const body = (await request.json()) as { source?: string; write?: boolean };
    if (!SOURCES.includes(body.source as Source)) return NextResponse.json({ error: `未知来源：${body.source}` }, { status: 400 });
    source = body.source as Source;
    write = body.write === true;
  }

  try {
    let result: StatusRefreshResult & { notes?: string[] };
    if (source === "brazil") {
      const r = await refreshBrazilPncpStatuses(supabase, { write });
      result = { ...r, notes: r.unreachable.length ? [`${r.unreachable.length} 条查询失败，例如 ${r.unreachable.slice(0, 2).join("；")}`] : [] };
    } else if (source === "chile") {
      const r = await refreshChileStatuses(supabase, { write });
      result = {
        ...r,
        notes: [
          ...(r.unreachable.length ? [`${r.unreachable.length} 条查询失败，例如 ${r.unreachable.slice(0, 2).join("；")}`] : []),
          ...(r.unknownEstados.length ? [`不认识的状态：${r.unknownEstados.join("、")}（未改动）`] : []),
        ],
      };
    } else if (source === "mexico") {
      const r = await refreshComprasMxStatuses(supabase, { write });
      result = {
        ...r,
        notes: [
          ...(r.notInCorpus ? [`${r.notInCorpus} 条在 LicitIA 全量数据里找不到（未改动）`] : []),
          ...(r.unknownEstatus.length ? [`不认识的状态：${r.unknownEstatus.join("、")}（未改动）`] : []),
        ],
      };
    } else {
      const r = await refreshPeruOxiStatuses(supabase, { write, file });
      result = { ...r, notes: [`清单共 ${r.exportRows} 行`] };
    }
    if (write && result.changes.length > 0) revalidateTenders();
    return NextResponse.json({ source, ...result });
  } catch (err) {
    await logAdminAlert(supabase, "refresh-statuses", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
