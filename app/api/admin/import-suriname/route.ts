import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestSuriname, type SurinameRow } from "@/lib/ingestion/ingest-suriname";
import type { SurinameImportResponse, SurinameImportRow } from "@/lib/ingestion/suriname-import-result";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 苏里南 tab's import button, over the same ingestSuriname() the daily
 * job runs, so the page and `cron:suriname` cannot diverge. One request to
 * gov.sr per press.
 *
 * Nothing here is public: Suriname is staged (lib/staged-countries.ts), so a
 * write lands in the admin pages only and no public cache needs dropping.
 */
export const maxDuration = 120;

function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403/i.test(message);
}

function slimRow(row: SurinameRow): SurinameImportRow {
  return {
    postId: row.notice.postId,
    slug: row.tender.slug,
    title: row.notice.title,
    url: row.notice.url,
    tier: row.tender.relevance?.tier ?? "excluded",
    outcome: row.outcome,
    method: row.notice.method,
    financier: row.notice.financier,
    ...(row.notice.deadline ? { deadline: row.notice.deadline } : {}),
  };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean };
  const write = body.write === true;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const cliCommand = `npm run cron:suriname${write ? " -- --write" : ""}`;

  try {
    const result = await ingestSuriname(supabase, { write });
    const rows = result.rows.map(slimRow);
    const response: SurinameImportResponse = {
      write,
      postCount: result.postCount,
      kept: rows.filter((row) => row.outcome === "write"),
      noDeadline: rows.filter((row) => row.outcome === "no_deadline"),
      others: rows.filter((row) => row.outcome === "excluded" || row.outcome === "closed"),
      staleWarning: result.staleWarning,
      ...(write ? { upsertedCount: result.upsertedCount ?? 0, failed: result.failed ?? [] } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, "import-suriname", err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
