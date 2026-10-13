import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestUruguay } from "@/lib/ingestion/ingest-uruguay";
import type { UruguayImportResponse, UruguayImportRow } from "@/lib/ingestion/uruguay-import-result";
import type { Tender } from "@/types/tender";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 乌拉圭 tab's import button (user, 2026-10-13: 后台增加), over the same
 * ingestUruguay() the daily job runs, so the page and `cron:uruguay` cannot
 * diverge. The 3-day window is ~200 calls read one at a time, about a minute
 * and a half (a 7-day read took 3.5 minutes on 2026-10-13).
 *
 * Nothing here is public: Uruguay is staged (lib/staged-countries.ts), so a
 * write lands in the admin pages only and no public cache needs dropping.
 */
export const maxDuration = 300;

function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|HTTP 5\d\d|403/i.test(message);
}

function slimRow(tender: Tender): UruguayImportRow {
  const tier = tender.relevance?.tier ?? "excluded";
  return {
    tenderNumber: tender.tenderNumber,
    slug: tender.slug,
    title: tender.title.es,
    buyer: tender.buyer,
    tier,
    closed: tender.status !== "open",
    reason: tier === "excluded" ? tender.relevance.reason.zh : "",
  };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean };
  const write = body.write === true;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const cliCommand = `npm run cron:uruguay${write ? " -- --write" : ""}`;

  try {
    const result = await ingestUruguay(supabase, { write });
    const keptSlugs = new Set(result.kept.map((tender) => tender.slug));
    const rows = result.rows.map((row) => slimRow(row.tender));
    const response: UruguayImportResponse = {
      write,
      listedCount: result.listedCount,
      inScopeCount: result.rows.length,
      failedReads: result.failedReads.length,
      kept: rows.filter((row) => keptSlugs.has(row.slug)),
      excluded: rows.filter((row) => !keptSlugs.has(row.slug)),
      ...(write ? { upsertedCount: result.upsertedCount ?? 0, failed: result.failed ?? [] } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, "import-uruguay", err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
