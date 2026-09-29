import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { ARGENTINA_SOURCE_LABELS, ARGENTINA_SOURCES, ingestArgentina } from "@/lib/ingestion/ingest-argentina";
import type { ArgentinaImportResponse, ArgentinaImportRow, ArgentinaSourceId } from "@/lib/ingestion/argentina-import-result";
import { convertToUsd } from "@/lib/currency";
import { logAdminAlert } from "@/lib/admin-alerts";
import { revalidateTenders } from "@/lib/cache-tags";

/**
 * The 阿根廷 tab's import button, over the same ingestArgentina() the daily job
 * runs, so the page and `cron:argentina` cannot diverge. The caller picks the
 * sources: COMPR.AR walks ~46 list pages and opens every open call one by
 * one, which can outlast the host's five minutes, so the form offers it
 * separately from the three quick ones.
 *
 * Argentina opened 2026-09-29, so a write drops the public list's cache like
 * every other country's import.
 */
export const maxDuration = 300;

function isConnectionFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|tunnel|403/i.test(message);
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean; sources?: string[] };
  const write = body.write === true;
  const sources = (body.sources ?? ARGENTINA_SOURCES).filter((id): id is ArgentinaSourceId => (ARGENTINA_SOURCES as string[]).includes(id));
  if (sources.length === 0) return NextResponse.json({ error: "请至少选一个来源" }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const cliCommand = `npm run cron:argentina -- --only ${sources.join(",")}${write ? " --write" : ""}`;

  try {
    // No minutes-long wait for an unreachable portal inside a five-minute request: report it, the button can be pressed again.
    const result = await ingestArgentina(supabase, { write, sources, portalReachRetryPausesMs: [] });
    // The public list is cached; drop it so this import shows up now.
    if (write) revalidateTenders();
    const rows: ArgentinaImportRow[] = result.rows.map(({ tender, source }) => {
      const usd = tender.estimatedValue !== undefined ? convertToUsd(tender.estimatedValue, tender.currency) : null;
      return {
        slug: tender.slug,
        source,
        tenderNumber: tender.tenderNumber,
        title: tender.title.es,
        buyer: tender.buyer,
        tier: tender.relevance.tier,
        reason: tender.relevance.reason?.zh ?? "",
        ...(tender.submissionDeadline ? { submissionDeadline: tender.submissionDeadline } : {}),
        ...(usd !== null && usd !== undefined ? { estimatedUsd: Math.round(usd) } : {}),
      };
    });
    const response: ArgentinaImportResponse = {
      write,
      sources: result.sources.map((source) => ({
        id: source.id,
        label: ARGENTINA_SOURCE_LABELS[source.id],
        listed: source.listed,
        mapped: source.mapped,
        kept: source.kept,
        skipped: source.skipped,
        failures: source.failures.length,
        ...(source.error ? { error: source.error } : {}),
        seconds: Math.round(source.seconds),
      })),
      kept: rows.filter((row) => row.tier !== "excluded"),
      excluded: rows.filter((row) => row.tier === "excluded"),
      ...(write ? { upsertedCount: result.upsertedCount ?? 0, failed: result.failed ?? [] } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isConnectionFailure(err)) return NextResponse.json({ error: message, connectionFailed: true, cliCommand }, { status: 502 });
    await logAdminAlert(supabase, "import-argentina", err);
    return NextResponse.json({ error: message, cliCommand }, { status: 500 });
  }
}
