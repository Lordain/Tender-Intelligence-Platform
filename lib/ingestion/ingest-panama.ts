/**
 * Panama ingestion — PanamaCompra V3's public list and pliego calls, for the
 * daily job (scripts/cron-panama.ts). Added 2026-10-06, STAGED
 * (lib/staged-countries.ts): what this writes shows in the admin pages only
 * (user, 2026-10-06, on 先导入但不对外显示，你在后台审核一两周: OK).
 *
 * The list is filtered by the date of each procedure's latest STATUS CHANGE,
 * not its publication (see panama-panamacompra-live.ts), so a window catches
 * both new calls and calls that moved — awarded, cancelled, suspended. So:
 *
 *   - the formal tenders that changed in the window are read, deduplicated
 *     by number;
 *   - the pliego page is read for those still taking bids by their status
 *     (Vigente), which is where the reference price and the deadline are —
 *     the ones in evaluation, awarded or cancelled cannot be written whatever
 *     the pliego says, and their new status is in the list already;
 *   - the ones still taking bids and kept by the platform's general rules are
 *     written through upsertTendersBatched(), every filter included;
 *   - one already stored whose status has moved on gets the new status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender, TenderStatus } from "@/types/tender";
import {
  PANAMA_TENDER_TYPES,
  fetchPanamaDetalle,
  fetchPanamaProcesos,
  pausePanamaDetail,
  type PanamaDetalle,
  type PanamaProceso,
} from "@/lib/ingestion/connectors/panama-panamacompra-live";
import { PANAMA, PANAMA_SOURCE_NAME, mapPanamaProcesoToTender, panamaStatus } from "@/lib/ingestion/panama-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { legacyStatus, lifecycleSchemaAvailable } from "@/lib/ingestion/lifecycle-schema";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";

export { PANAMA_SOURCE_NAME };

/** Statuses of a procedure still in progress — taking bids, in evaluation, paused. */
const LIVE_STATUSES = /^(vigente|por adjudicar|suspendido|en reclamo|por autorizar)$/i;

export type PanamaIngestResult = {
  /** Unique formal tenders whose status changed in the window. */
  listedCount: number;
  liveCount: number;
  /** Pliegos read: the live ones still taking bids by their status. */
  detailCount: number;
  detailErrors: number;
  /** Pliegos left unread because the run's time budget ran out; the next run reads them. */
  unreadForTime: number;
  truncatedTypes: string[];
  rows: { proceso: PanamaProceso; tender: Tender }[];
  kept: Tender[];
  write: boolean;
  upsertedCount?: number;
  statusUpdates?: number;
  failed?: { slug: string; error: string }[];
};

/** Rows already stored for this source whose status the window says has changed. */
async function updateStoredStatuses(supabase: SupabaseClient, moved: Tender[]): Promise<number> {
  if (moved.length === 0) return 0;
  const lifecycle = await lifecycleSchemaAvailable(supabase);
  let updated = 0;
  for (let index = 0; index < moved.length; index += 100) {
    const chunk = moved.slice(index, index + 100);
    const { data, error } = await supabase
      .from("tenders")
      .select("slug,status")
      .eq("source_name", PANAMA_SOURCE_NAME)
      .in("slug", chunk.map((tender) => tender.slug));
    if (error) throw new Error(`读取已入库的巴拿马项目失败：${error.message}`);
    const stored = new Map(((data ?? []) as Array<{ slug: string; status: TenderStatus }>).map((row) => [row.slug, row.status]));
    for (const tender of chunk) {
      const next = lifecycle ? tender.status : legacyStatus(tender.status);
      const current = stored.get(tender.slug);
      if (current === undefined || current === next) continue;
      const { error: updateError } = await supabase.from("tenders").update({ status: next }).eq("slug", tender.slug);
      if (updateError) throw new Error(`更新 ${tender.slug} 的状态失败：${updateError.message}`);
      updated += 1;
    }
  }
  return updated;
}

export async function ingestPanama(
  supabase: SupabaseClient | null,
  options: {
    write: boolean;
    days?: number;
    now?: Date;
    log?: (line: string) => void;
    /** Stop reading pliegos after this many ms (the admin page's request has 300 s); the daily job has no limit. */
    budgetMs?: number;
  },
): Promise<PanamaIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const log = options.log ?? (() => {});
  const startedAt = Date.now();

  const byNumber = new Map<string, PanamaProceso>();
  const truncatedTypes: string[] = [];
  for (const [id, name] of Object.entries(PANAMA_TENDER_TYPES)) {
    const { rows, truncated } = await fetchPanamaProcesos(Number(id), from, now.toISOString());
    for (const row of rows) byNumber.set(row.numProceso, row);
    if (truncated) truncatedTypes.push(name);
    log(`  ${name}: ${rows.length}`);
  }
  const procesos = [...byNumber.values()];

  let detailErrors = 0;
  let liveCount = 0;
  let detailCount = 0;
  let unreadForTime = 0;
  const rows: PanamaIngestResult["rows"] = [];
  for (const proceso of procesos) {
    let detalle: PanamaDetalle | undefined;
    const estado = proceso.nombreRealizado.trim();
    if (LIVE_STATUSES.test(estado)) liveCount += 1;
    if (LIVE_STATUSES.test(estado) && panamaStatus(estado, undefined, now) === "open") {
      if (options.budgetMs !== undefined && Date.now() - startedAt > options.budgetMs) {
        unreadForTime += 1;
        rows.push({ proceso, tender: mapPanamaProcesoToTender(proceso, undefined, now) });
        continue;
      }
      detailCount += 1;
      try {
        detalle = await fetchPanamaDetalle(proceso);
      } catch (error) {
        detailErrors += 1;
        log(`  详情失败 ${proceso.numProceso}：${error instanceof Error ? error.message : String(error)}`);
      }
      await pausePanamaDetail();
    }
    rows.push({ proceso, tender: mapPanamaProcesoToTender(proceso, detalle, now) });
  }

  // Still taking bids, kept by the rules, and read in full: a live call whose
  // pliego could not be read has no price and no deadline, and would be
  // judged on its title alone. The next run reads it again.
  const kept = rows
    .filter(({ proceso, tender }) => tender.status === "open" && tender.relevance.tier !== "excluded" && LIVE_STATUSES.test(proceso.nombreRealizado.trim()))
    .filter(({ tender }) => tender.submissionDeadline !== undefined || tender.estimatedValue !== undefined)
    .map(({ tender }) => tender);

  const result: PanamaIngestResult = { listedCount: procesos.length, liveCount, detailCount, detailErrors, unreadForTime, truncatedTypes, rows, kept, write: options.write };
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");

  const { upsertedCount, failed } = await upsertTendersBatched(supabase, kept);
  const keptSlugs = new Set(kept.map((tender) => tender.slug));
  const moved = rows.map(({ tender }) => tender).filter((tender) => !keptSlugs.has(tender.slug) && tender.status !== "open");
  const statusUpdates = await updateStoredStatuses(supabase, moved);
  return { ...result, upsertedCount, statusUpdates, failed };
}

export { PANAMA };
