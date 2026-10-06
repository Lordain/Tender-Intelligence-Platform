import { NextResponse } from "next/server";
import type { Tender } from "@/types/tender";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestPanama } from "@/lib/ingestion/ingest-panama";
import { PANAMA_MANUAL_MAX_DAYS, type PanamaImportResponse, type PanamaImportRow } from "@/lib/ingestion/panama-import-result";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 巴拿马 tab's import button (user, 2026-10-06: 「巴拿马导入」页面，只拉最近
 * 1-5 天的项目，回溯仍交给每日任务), over the same ingestPanama() the daily job
 * runs, so the page and `cron:panama` cannot diverge. Five days were ~335
 * procedures and 50 pliegos on 2026-10-06, about a minute; the pliegos stop
 * at 240 s anyway so the answer comes back inside the 300 s limit, and the
 * daily job reads what was left.
 *
 * Nothing here is public: Panama is staged (lib/staged-countries.ts), so a
 * write lands in the admin pages only and no public cache needs dropping.
 */
export const maxDuration = 300;

const PLIEGO_BUDGET_MS = 240_000;

function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403|502|503|504/i.test(message);
}

function slimRow(tender: Tender): PanamaImportRow {
  return {
    number: tender.tenderNumber,
    slug: tender.slug,
    title: tender.title.es,
    buyer: tender.buyer,
    tier: tender.relevance?.tier ?? "excluded",
    value: tender.estimatedValue,
    deadline: tender.submissionDeadline,
  };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; days?: number };
  const write = body.write === true;
  const days = Number(body.days ?? 3);
  if (!Number.isInteger(days) || days < 1 || days > PANAMA_MANUAL_MAX_DAYS) {
    return NextResponse.json({ error: `天数需要是 1–${PANAMA_MANUAL_MAX_DAYS} 之间的整数` }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const cliCommand = `npm run cron:panama -- --days ${days}${write ? " --write" : ""}`;

  try {
    const result = await ingestPanama(supabase, { write, days, budgetMs: PLIEGO_BUDGET_MS });
    const keptSlugs = new Set(result.kept.map((tender) => tender.slug));
    const excluded = result.rows
      .map(({ tender }) => tender)
      .filter((tender) => tender.status === "open" && tender.relevance?.tier === "excluded" && !keptSlugs.has(tender.slug));
    const response: PanamaImportResponse = {
      write,
      days,
      listedCount: result.listedCount,
      liveCount: result.liveCount,
      detailCount: result.detailCount,
      detailErrors: result.detailErrors,
      unreadForTime: result.unreadForTime,
      kept: result.kept.map(slimRow),
      excluded: excluded.map(slimRow),
      ...(write ? { upsertedCount: result.upsertedCount ?? 0, statusUpdates: result.statusUpdates ?? 0, failed: result.failed ?? [] } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, "import-panama", err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
