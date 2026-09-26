import { NextResponse } from "next/server";
import { revalidateTenders } from "@/lib/cache-tags";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { logAdminAlert } from "@/lib/admin-alerts";
import {
  refreshBrazilAwards,
  refreshChileAwards,
  refreshColombiaAwards,
  refreshMexicoAwards,
  refreshPeruOxiAwards,
} from "@/lib/ingestion/award-sources";
import { PERU_OECE_AWARDS_COMMAND, type AwardSourceId } from "@/lib/ingestion/award-source-labels";
import type { AwardRefreshResult } from "@/lib/ingestion/award-results";

/**
 * 导入中标结果, by hand, one country at a time (user, 2026-09-26: 在后台，也
 * 增加一个手动导入中标结果的触发选项，可以在每个国家都有对应的选项). The same
 * refreshers the daily job runs after its status refresh; only tenders
 * already 已中标 are touched, and only their three award columns — see
 * lib/ingestion/award-results.ts for what is and is not overwritten.
 *
 * JSON `{ source, write }`, or multipart with an OxI all-states Excel
 * (`file`) for ProInversión. Peru OECE answers 409 with the CLI command:
 * SEACE refuses this deployment's network (lib/ingestion/README.md).
 */
export const maxDuration = 300;

const RUNNERS: Record<Exclude<AwardSourceId, "oece" | "oxi">, (supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, write: boolean) => Promise<AwardRefreshResult>> = {
  mexico: (supabase, write) => refreshMexicoAwards(supabase, { write }),
  brazil: (supabase, write) => refreshBrazilAwards(supabase, { write }),
  chile: (supabase, write) => refreshChileAwards(supabase, { write }),
  colombia: (supabase, write) => refreshColombiaAwards(supabase, { write }),
};

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  let source: string;
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
    source = body.source ?? "";
    write = body.write === true;
  }

  if (source === "oece") {
    return NextResponse.json(
      { error: `SEACE 拒绝服务器（Vercel）访问，秘鲁 OECE 的中标结果只能在本机运行：${PERU_OECE_AWARDS_COMMAND}`, command: PERU_OECE_AWARDS_COMMAND },
      { status: 409 },
    );
  }

  try {
    let result: AwardRefreshResult;
    if (source === "oxi") result = await refreshPeruOxiAwards(supabase, { write, file });
    else if (source in RUNNERS) result = await RUNNERS[source as keyof typeof RUNNERS](supabase, write);
    else return NextResponse.json({ error: `未知来源：${source}` }, { status: 400 });
    if (write && result.filled.length > 0) revalidateTenders();
    return NextResponse.json({ source, ...result });
  } catch (err) {
    await logAdminAlert(supabase, "refresh-awards", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
