import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ingestGuyana, type GuyanaRow } from "@/lib/ingestion/ingest-guyana";
import type { GuyanaImportResponse, GuyanaImportRow } from "@/lib/ingestion/guyana-import-result";
import { logAdminAlert } from "@/lib/admin-alerts";

/**
 * The 圭亚那 tab's import button (user, 2026-09-27: 增加手动导入按钮), over the
 * same ingestGuyana() the daily job runs, so the page and `cron:guyana` cannot
 * diverge. The web host has no pdftotext; the notices are read with pdf.js
 * there (guyana-eprocure-live.ts). ~35 notices took ~6 s on 2026-09-27.
 *
 * Nothing here is public: Guyana is staged (lib/staged-countries.ts), so a
 * write lands in the admin pages only and no public cache needs dropping.
 */
export const maxDuration = 300;

function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403/i.test(message);
}

function slimRow(row: GuyanaRow): GuyanaImportRow {
  return {
    projectId: row.opportunity.projectId,
    slug: row.tender.slug,
    title: row.tender.title.es,
    tier: row.tender.relevance?.tier ?? "excluded",
    competition: row.facts.competition,
    fromSibling: row.factsFrom === "sibling",
    financier: row.facts.financier,
  };
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean };
  const write = body.write === true;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const cliCommand = `npm run cron:guyana${write ? " -- --write" : ""}`;

  try {
    const result = await ingestGuyana(supabase, { write });
    const rows = result.rows.map(slimRow);
    const response: GuyanaImportResponse = {
      write,
      listedCount: result.listedCount,
      readNoticeCount: result.readNoticeCount,
      kept: rows.filter((row) => row.tier !== "excluded"),
      excluded: rows.filter((row) => row.tier === "excluded"),
      staleWarning: result.staleWarning,
      ...(write ? { upsertedCount: result.upsertedCount ?? 0, failed: result.failed ?? [] } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, "import-guyana", err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
