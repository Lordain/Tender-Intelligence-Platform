import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestDominicana, type DominicanaIngestResult } from "@/lib/ingestion/ingest-dominicana";
import { DOMINICANA_IMPORT_MAX_DAYS, type DominicanaImportResponse, type DominicanaImportRow } from "@/lib/ingestion/dominicana-import-result";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 多米尼加 tab's import button (user, 2026-10-04: 也做一下手动接口), over
 * the same ingestDominicana() the daily job runs, so the page and
 * `cron:dominicana` cannot diverge. One window of 30 days is about 7,000
 * procedures — seven API pages — and a few dozen document lists.
 *
 * Nothing here is public: the Dominican Republic is staged
 * (lib/staged-countries.ts), so a write lands in the admin pages only and no
 * public cache needs dropping.
 */
export const maxDuration = 300;

function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|HTTP 403|请求失败/i.test(message);
}

function slimRow(row: DominicanaIngestResult["rows"][number]): DominicanaImportRow {
  return {
    code: row.proceso.codigo_proceso,
    slug: row.tender.slug,
    title: row.tender.title.es,
    tier: row.tender.relevance.tier,
    open: row.tender.status === "open",
    modalidad: row.proceso.modalidad,
    amount: row.tender.estimatedValue ?? null,
    currency: row.tender.currency ?? null,
    buyer: row.tender.buyer,
  };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; days?: number };
  const write = body.write === true;
  const days = Number.isInteger(body.days) && body.days! >= 1 && body.days! <= DOMINICANA_IMPORT_MAX_DAYS ? body.days! : 3;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const cliCommand = `npm run cron:dominicana -- --days ${days}${write ? " --write" : ""}`;

  try {
    const result = await ingestDominicana(supabase, { write, days });
    const keptSlugs = new Set(result.kept.map((tender) => tender.slug));
    const rows = result.rows.map(slimRow);
    const response: DominicanaImportResponse = {
      write,
      days,
      listedCount: result.listedCount,
      publicTenderCount: result.publicTenderCount,
      kept: rows.filter((row) => keptSlugs.has(row.slug)),
      notKept: rows.filter((row) => !keptSlugs.has(row.slug)),
      ...(write ? { upsertedCount: result.upsertedCount ?? 0, failed: result.failed ?? [], documentLinks: result.documentLinks ?? 0 } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, "import-dominicana", err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
