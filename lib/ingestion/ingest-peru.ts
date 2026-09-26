/**
 * Shared Peru ingestion, behind both `npm run ingest:peru-live` /
 * `ingest:peru-oxi` and the admin 新项目清单 page's 秘鲁 tab — the same
 * split Colombia has (lib/ingestion/ingest-colombia.ts), for the same reason:
 * the CLI and the web button must write through one path, or they drift.
 *
 * Peru has TWO live sources and they are deliberately separate calls here,
 * because they are different procurement systems with different lag, coverage
 * and hit rates — not two halves of one feed. See peru-oece-mapper.ts and
 * peru-oxi-mapper.ts for what each one is.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOeceRecordsForSegment, recentSegmentIds, segmentsForDays } from "@/lib/ingestion/connectors/peru-oece-live";
import { mapOeceRecordToTender, oeceDocumentLinks, type OeceRecord, type TenderDocumentLink } from "@/lib/ingestion/peru-oece-mapper";
import { saveDocumentLinks, type DocumentLinksForSlug } from "@/lib/ingestion/document-links";
import { downloadOxiExport, OXI_ESTADO_TODOS } from "@/lib/ingestion/connectors/peru-oxi-live";
import { readPeruOxiWorkbook } from "@/lib/ingestion/connectors/peru-oxi-file";
import { mapPeruOxiRowToTender, oxiEstadoStatus, peruOxiSlug, PERU_OXI_SOURCE_NAME, PERU_OXI_SOURCE_URL, type PeruOxiRow } from "@/lib/ingestion/peru-oxi-mapper";
import { refreshStoredStatuses, type ObservedStatus, type StatusRefreshResult } from "@/lib/ingestion/status-refresh";
import { filterRecentTenders, filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

export const PERU_OECE_SOURCE_NAME =
  "OECE — Organismo Especializado para las Contrataciones Públicas Eficientes (Perú)";

export type PeruIngestResult = {
  source: "oece" | "oxi";
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  /** Rows that would actually surface in the feed — everything not "excluded". */
  surfacedCount: number;
  tierCounts: Record<TenderRelevanceTier, number>;
  segments?: string[];
  write: boolean;
  /** Only populated when options.preview is set; see that option. */
  preview?: Tender[];
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  /**
   * Official bid-document links recorded alongside the written tenders
   * (OECE only — the OxI export carries no per-document URLs). Feeds the
   * 批量下载标书 button on /admin/documents-needed; see
   * lib/ingestion/document-links.ts.
   */
  documentLinks?: { tenders: number; links: number };
  /**
   * Source rows that arrived carrying a tender number another row in the same
   * fetch already used, so they collapse onto one slug.
   *
   * Reported rather than quietly deduplicated, because this is a fact about
   * the SOURCE and it has to reach a human. Surfaced 2026-09-18 when
   * ProInversión's OxI export returned CONV20262760 twice — visible only as a
   * React duplicate-key warning in the browser console, which is not where
   * "the government portal published two different projects under one code"
   * belongs. upsert-tenders.ts does collapse them on write (newest publication
   * date wins), and that is the right call for a source that republishes one
   * procurement — but wrong, and silent, if the two rows are genuinely two
   * different projects, which is exactly what Colombia's LP-006-2026 turned
   * out to be. So the import says so and leaves the judgement to a person.
   */
  duplicateTenderNumbers?: { slug: string; tenderNumber: string; count: number }[];
  sample: Tender[];
  /**
   * OxI only: what the rows' Estado column said about tenders already
   * stored (paused, resumed, awarded, deserted, cancelled). Present whenever
   * the file or export carried states other than En Proceso — always for an
   * all-states file, which is used for this and nothing else.
   */
  statusRefresh?: StatusRefreshResult;
  /** OxI only: the file was an all-states export, so no tender was imported from it — see readPeruOxiWorkbook. */
  statusOnly?: boolean;
};

export type PeruIngestOptions = {
  write: boolean;
  /** Calendar-month segments to fetch (OECE only). Ignored when `segment` or `days` is set. */
  months?: number;
  /** Rolling window in days. Decides BOTH which month segments are fetched and what is kept — `months` is ignored when this is set. 0/undefined = use `months`. */
  days?: number;
  /** One specific `YYYY-MM` segment (OECE only). */
  segment?: string;
  /** Server-side category filter (OECE only) — normally left unset; lib/relevance.ts decides what is worth keeping. */
  category?: "goods" | "works" | "services";
  sourceId?: string;
  /** Return every kept row, not just the top five — the CLI's classification report needs all of them. */
  preview?: boolean;
};

/**
 * Rows sharing a slug within one fetch — see duplicateTenderNumbers.
 *
 * Counted over EVERYTHING kept, excluded rows included: a duplicate code is a
 * source defect whether or not either copy would have surfaced, and finding
 * out about it only when the surviving copy happens to be interesting is how
 * it stayed invisible until a React key warning surfaced it.
 */
function findDuplicateSlugs(kept: Tender[]): { slug: string; tenderNumber: string; count: number }[] {
  const bySlug = new Map<string, Tender[]>();
  for (const tender of kept) {
    const held = bySlug.get(tender.slug);
    if (held) held.push(tender);
    else bySlug.set(tender.slug, [tender]);
  }
  return [...bySlug.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([slug, group]) => ({ slug, tenderNumber: group[0].tenderNumber, count: group.length }));
}

function summarize(
  source: "oece" | "oxi",
  fetchedCount: number,
  mapped: Tender[],
  kept: Tender[],
  options: { write: boolean; segments?: string[]; preview?: boolean },
): PeruIngestResult {
  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of kept) tierCounts[tender.relevance.tier] += 1;
  const duplicates = findDuplicateSlugs(kept);
  return {
    source,
    fetchedCount,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    surfacedCount: kept.length - tierCounts.excluded,
    tierCounts,
    segments: options.segments,
    write: options.write,
    ...(options.preview ? { preview: kept } : {}),
    ...(duplicates.length > 0 ? { duplicateTenderNumbers: duplicates } : {}),
    // Ranked so the preview shows what is actually worth looking at, not
    // whichever rows the source happened to return first.
    sample: kept
      .filter((tender) => tender.relevance.tier !== "excluded")
      .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
      .slice(0, 5),
  };
}

function applyRecency(mapped: Tender[], options: PeruIngestOptions, defaultMonths: number): Tender[] {
  if (options.days && options.days > 0) return filterTendersPublishedWithinDays(mapped, options.days);
  return filterRecentTenders(mapped, options.months ?? defaultMonths);
}

async function writeOut(supabase: SupabaseClient, kept: Tender[], result: PeruIngestResult): Promise<PeruIngestResult> {
  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}

/** SEACE/OECE via the live `/recordsAfter` index — the ordinary-budget procurement backbone. */
export async function ingestPeruOece(
  supabase: SupabaseClient | null,
  options: PeruIngestOptions,
  onProgress?: (message: string) => void,
): Promise<PeruIngestResult> {
  const months = options.months ?? 2;
  // `days` wins when it is set, and decides the segments itself rather than
  // trusting `months` to cover the same window. The two used to be independent
  // knobs the caller had to reconcile: asking for 5 days with 1 month silently
  // lost whatever fell in the previous month (every time the run happened in
  // the first days of one), and asking for 5 days with 6 months downloaded
  // ~24,000 records to keep a few dozen. See segmentsForDays().
  const segments = options.segment
    ? [options.segment]
    : options.days && options.days > 0
      ? segmentsForDays(options.days)
      : recentSegmentIds(months);
  const sourceId = options.sourceId ?? "seace_v3";

  const records: OeceRecord[] = [];
  for (const segment of segments) {
    const fetched = await fetchOeceRecordsForSegment(
      { dataSegmentationId: segment, sourceId, mainProcurementCategory: options.category },
      (page, soFar) => {
        if (page === 1 || page % 10 === 0) onProgress?.(`${segment}: page ${page}, ${soFar} record(s)`);
      },
    );
    onProgress?.(`${segment}: ${fetched.length} record(s)`);
    records.push(...fetched);
  }

  // The document links live on the RECORD, not on the mapped Tender, so the
  // two have to be paired here — mapping to Tender first and looking the
  // record back up afterwards would need an ocid->record index for no gain.
  const linksBySlug = new Map<string, TenderDocumentLink[]>();
  const mapped: Tender[] = [];
  for (const record of records) {
    const tender = mapOeceRecordToTender(record, PERU_OECE_SOURCE_NAME);
    if (!tender) continue;
    mapped.push(tender);
    const links = oeceDocumentLinks(record);
    if (links.length > 0) linksBySlug.set(tender.slug, links);
  }

  const kept = applyRecency(mapped, options, months);
  const result = summarize("oece", records.length, mapped, kept, { write: options.write, segments, preview: options.preview });

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const written = await writeOut(supabase, kept, result);

  // After the upsert, never before: a link row references tenders.id, and an
  // "excluded" tender is deliberately never written at all (see
  // upsert-tenders.ts), so its slug has no id to point at.
  const saved = await saveDocumentLinks(
    supabase,
    kept
      .filter((tender) => tender.relevance.tier !== "excluded" && linksBySlug.has(tender.slug))
      .map((tender) => ({ slug: tender.slug, links: linksBySlug.get(tender.slug) ?? [] })),
  );
  onProgress?.(`recorded ${saved.linkCount} official document link(s) across ${saved.tendersWithLinks} tender(s)`);
  return { ...written, documentLinks: { tenders: saved.tendersWithLinks, links: saved.linkCount } };
}

/**
 * Re-reads the segments the tenders we ALREADY have were published in, and
 * lets their current OCDS record correct their status.
 *
 * Layer 2 of the three the user set (2026-09-12): 没有日期从是否有中标状态识别.
 * A Peru record gains an `awards` array once the buena pro is granted, and
 * mapOeceRecordToTender turns that into "awarded" — so the feed can learn a
 * tender is over without any date existing anywhere. What was missing is that
 * nothing ever went back to look. An ordinary run fetches the LAST FEW MONTHS
 * of segments, and a tender published in March is in March's segment, not
 * September's: the award for it lands in a segment no top-up ever asks for
 * again.
 *
 * So the segments come from the rows themselves. Every Peru OECE tender still
 * reading open contributes its publication month, and only those months are
 * fetched.
 *
 * Two deliberate differences from ingestPeruOece():
 * - No recency filter. Recency is the exact thing being worked around here;
 *   applying it would discard every record this function exists to re-read.
 * - Nothing NEW is written. Only slugs already in the database are kept, so a
 *   refresh cannot quietly backfill months of old tenders as if they were new
 *   arrivals — a re-read of 24 months of segments would otherwise dump two
 *   years of March tenders into 本日新增.
 */
export async function refreshPeruOeceStatuses(
  supabase: SupabaseClient,
  options: { write: boolean; sourceId?: string; maxSegments?: number },
  onProgress?: (message: string) => void,
): Promise<{
  openCount: number;
  segments: string[];
  skippedSegments: number;
  matchedCount: number;
  nowAwarded: { slug: string; title: string }[];
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
}> {
  const open: { slug: string; publication_date: string; title: { zh?: string; es?: string } | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, publication_date, title")
      .eq("source_name", PERU_OECE_SOURCE_NAME)
      // The terminal statuses (lib/tender-status.ts) — a row already
      // reading 已中标/已取消/流标 has nothing left for a refresh to discover.
      .not("status", "in", "(awarded,cancelled,deserted)")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read open Peru tenders: ${error.message}`);
    const page = data ?? [];
    open.push(...(page as typeof open));
    if (page.length < PAGE) break;
  }

  const bySegment = new Map<string, string[]>();
  for (const row of open) {
    const segment = row.publication_date?.slice(0, 7);
    if (!segment || !/^\d{4}-\d{2}$/.test(segment)) continue;
    const slugs = bySegment.get(segment);
    if (slugs) slugs.push(row.slug);
    else bySegment.set(segment, [row.slug]);
  }

  // Newest first, so a capped run refreshes the months most likely to have
  // just changed rather than whichever the Map happened to list first.
  const allSegments = [...bySegment.keys()].sort().reverse();
  const maxSegments = options.maxSegments ?? 12;
  const segments = allSegments.slice(0, maxSegments);
  const skippedSegments = allSegments.length - segments.length;

  const knownSlugs = new Set(open.map((row) => row.slug));
  const sourceId = options.sourceId ?? "seace_v3";
  const matched: Tender[] = [];

  for (const segment of segments) {
    const fetched = await fetchOeceRecordsForSegment({ dataSegmentationId: segment, sourceId }, (page, soFar) => {
      if (page === 1 || page % 10 === 0) onProgress?.(`${segment}: page ${page}, ${soFar} record(s)`);
    });
    let hits = 0;
    for (const record of fetched) {
      const tender = mapOeceRecordToTender(record, PERU_OECE_SOURCE_NAME);
      if (!tender || !knownSlugs.has(tender.slug)) continue;
      matched.push(tender);
      hits += 1;
    }
    onProgress?.(`${segment}: ${fetched.length} record(s), ${hits} of ours`);
  }

  const titleBySlug = new Map(open.map((row) => [row.slug, row.title?.zh || row.title?.es || row.slug]));
  const nowAwarded = matched
    .filter((tender) => tender.status === "awarded")
    .map((tender) => ({ slug: tender.slug, title: titleBySlug.get(tender.slug) ?? tender.slug }));

  const base = { openCount: open.length, segments, skippedSegments, matchedCount: matched.length, nowAwarded, write: options.write };
  if (!options.write) return base;

  const { upsertedCount, failed } = await upsertTendersBatched(supabase, matched);
  return { ...base, upsertedCount, failed };
}

/** Rows whose Estado says anything other than En Proceso are status observations, not tenders to import. */
function isInProcessRow(row: PeruOxiRow): boolean {
  const status = oxiEstadoStatus(row.Estado);
  return !row.Estado?.trim() || status === "open";
}

function oxiObservations(rows: PeruOxiRow[]): ObservedStatus[] {
  const observed: ObservedStatus[] = [];
  for (const row of rows) {
    const code = row["Codigo Convocatoria"]?.trim();
    const status = oxiEstadoStatus(row.Estado);
    if (code && status) observed.push({ slug: peruOxiSlug(code), status });
  }
  return observed;
}

/**
 * ProInversión Obras por Impuestos.
 *
 * `file` lets a caller pass an export a human downloaded, bypassing the
 * network — the fallback for the day investinperu.pe changes its endpoint.
 * Either export layout is accepted (see readPeruOxiWorkbook):
 *
 *   - the in-process export: En Proceso rows are imported as tenders, as
 *     always; any row in another state only updates a tender already stored;
 *   - an all-states export: nothing is imported, and every row updates the
 *     status of the tender already stored under its code — 暂停、恢复、
 *     中标、流标、取消 (user, 2026-09-26: 包括手动导入部分).
 */
export async function ingestPeruOxi(
  supabase: SupabaseClient | null,
  options: PeruIngestOptions & { file?: { buffer: Buffer; fileName: string } },
  onProgress?: (message: string) => void,
): Promise<PeruIngestResult> {
  let buffer: Buffer;
  if (options.file) {
    buffer = options.file.buffer;
  } else {
    onProgress?.("fetching the OxI export from investinperu.pe...");
    buffer = await downloadOxiExport();
    onProgress?.(`got ${(buffer.length / 1024).toFixed(0)} KB`);
  }

  const workbook = await readPeruOxiWorkbook({ buffer, fileName: options.file?.fileName ?? "oxi-export.xlsx" });
  const rows = workbook.rows;

  if (!workbook.hasBidSchedule) {
    onProgress?.(`all-states file (${rows.length} rows, no bid schedule) — refreshing statuses only, importing nothing`);
    const empty = summarize("oxi", rows.length, [], [], { write: options.write, preview: options.preview });
    if (!supabase) {
      if (options.write) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
      return { ...empty, statusOnly: true };
    }
    const statusRefresh = await refreshStoredStatuses(supabase, oxiObservations(rows), { write: options.write });
    return { ...empty, statusOnly: true, statusRefresh };
  }

  const inProcess = rows.filter(isInProcessRow);
  const mapped = inProcess
    .map((row) => mapPeruOxiRowToTender(row, PERU_OXI_SOURCE_NAME, PERU_OXI_SOURCE_URL))
    .filter((tender): tender is Tender => tender !== null);
  // The export is a snapshot of what is open right now, so months defaults to
  // 0 (no filter): a convocatoria that closes drops out of the next export
  // rather than ageing inside this one. --days still narrows it on request.
  const kept = applyRecency(mapped, options, 0);
  const result = summarize("oxi", rows.length, mapped, kept, { write: options.write, preview: options.preview });

  const otherStates = rows.filter((row) => !isInProcessRow(row));
  if (!options.write) {
    if (otherStates.length === 0 || !supabase) return result;
    return { ...result, statusRefresh: await refreshStoredStatuses(supabase, oxiObservations(otherStates), { write: false }) };
  }
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const written = await writeOut(supabase, kept, result);
  if (otherStates.length === 0) return written;
  return { ...written, statusRefresh: await refreshStoredStatuses(supabase, oxiObservations(otherStates), { write: true }) };
}

/**
 * The daily OxI status refresh: every tender this platform holds from OxI,
 * checked against ProInversión's all-states export.
 *
 * The in-process export alone cannot do this — a convocatoria that is
 * suspended, awarded or declared desierto simply drops out of it, which says
 * it is no longer in process and nothing about what happened. The all-states
 * export says what happened, and says it again when a suspended one returns
 * to En Proceso (恢复): that row goes back to open here, and the same day's
 * in-process import brings its new dates.
 */
export async function refreshPeruOxiStatuses(
  supabase: SupabaseClient,
  options: { write: boolean; file?: { buffer: Buffer; fileName: string } },
  onProgress?: (message: string) => void,
): Promise<StatusRefreshResult & { exportRows: number; states: Record<string, number> }> {
  let buffer: Buffer;
  if (options.file) {
    buffer = options.file.buffer;
  } else {
    onProgress?.("fetching the all-states OxI export from investinperu.pe...");
    buffer = await downloadOxiExport(OXI_ESTADO_TODOS);
    onProgress?.(`got ${(buffer.length / 1024).toFixed(0)} KB`);
  }
  const { rows } = await readPeruOxiWorkbook({ buffer, fileName: options.file?.fileName ?? "oxi-todos.xlsx" });

  const states: Record<string, number> = {};
  for (const row of rows) states[row.Estado?.trim() || "（空）"] = (states[row.Estado?.trim() || "（空）"] ?? 0) + 1;
  // The "Todos" filter value is a reasoned guess (peru-oxi-live.ts). An
  // answer holding one state is what a wrong guess would look like — every
  // tender would then be "refreshed" to that state — so it is refused.
  const recognised = Object.keys(states).filter((estado) => oxiEstadoStatus(estado) !== undefined);
  if (rows.length === 0 || recognised.length < 3) {
    throw new Error(
      `OxI 全部状态导出看起来不是「全部」：${rows.length} 行，状态 ${JSON.stringify(states)}。` +
        "EstadoConvocatoria 的「全部」取值可能不对，本次不改任何状态。",
    );
  }
  const result = await refreshStoredStatuses(supabase, oxiObservations(rows), { write: options.write });
  return { ...result, exportRows: rows.length, states };
}

export type PeruDocumentLinkBackfillResult = {
  segments: string[];
  recordCount: number;
  /** Records that carried at least one downloadable link, before matching against what is stored. */
  tendersWithLinks: number;
  linkCount: number;
  write: boolean;
  /** Populated only on a write. */
  saved?: { tendersWithLinks: number; linkCount: number; unmatchedSlugs: number; failed: { slug: string; error: string }[] };
};

/**
 * Records official bid-document links for Peru tenders ALREADY in Supabase.
 *
 * ingestPeruOece captures these as it writes new tenders, but every Peru row
 * ingested before that existed has none — and the 批量下载标书 button has
 * nothing to download for them. This re-reads the same OCDS segments and
 * fills the links in without touching the tenders themselves: no
 * reclassification, no upsert, no deletions. Safe to re-run; links upsert on
 * (tender_id, source_url).
 *
 * Shared by `npm run backfill:peru-documents` and the 秘鲁 tab's local-only
 * panel, for the same reason every other ingestion path here is shared: two
 * copies drift, and this one decides which tenders are downloadable.
 */
export async function backfillPeruDocumentLinks(
  supabase: SupabaseClient | null,
  options: { write: boolean; months?: number; segment?: string; sourceId?: string },
  onProgress?: (message: string) => void,
): Promise<PeruDocumentLinkBackfillResult> {
  const months = options.months ?? 2;
  // No `days` here on purpose: the backfill is a catch-up over whole months
  // for rows that predate link capture, not a rolling top-up.
  const segments = options.segment ? [options.segment] : recentSegmentIds(months);
  const sourceId = options.sourceId ?? "seace_v3";

  const entries: DocumentLinksForSlug[] = [];
  let recordCount = 0;
  for (const segment of segments) {
    const records = await fetchOeceRecordsForSegment({ dataSegmentationId: segment, sourceId }, (page, soFar) => {
      if (page === 1 || page % 10 === 0) onProgress?.(`${segment}: page ${page}, ${soFar} record(s)`);
    });
    recordCount += records.length;
    for (const record of records) {
      // Mapped rather than slugified inline, so the slug this matches on is
      // byte-identical to the one the ingest wrote — a hand-rolled second slug
      // rule is exactly how a backfill ends up matching nothing.
      const tender = mapOeceRecordToTender(record, PERU_OECE_SOURCE_NAME);
      if (!tender) continue;
      const links = oeceDocumentLinks(record);
      if (links.length > 0) entries.push({ slug: tender.slug, links });
    }
    onProgress?.(`${segment}: ${records.length} record(s)`);
  }

  const result: PeruDocumentLinkBackfillResult = {
    segments,
    recordCount,
    tendersWithLinks: entries.length,
    linkCount: entries.reduce((sum, entry) => sum + entry.links.length, 0),
    write: options.write,
  };
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");

  const saved = await saveDocumentLinks(supabase, entries);
  return { ...result, saved };
}
