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
import { fetchOeceRecordsForSegment, recentSegmentIds } from "@/lib/ingestion/connectors/peru-oece-live";
import { mapOeceRecordToTender, oeceDocumentLinks, type OeceRecord, type TenderDocumentLink } from "@/lib/ingestion/peru-oece-mapper";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { downloadOxiExport } from "@/lib/ingestion/connectors/peru-oxi-live";
import { readPeruOxiFile } from "@/lib/ingestion/connectors/peru-oxi-file";
import { mapPeruOxiRowToTender, PERU_OXI_SOURCE_NAME, PERU_OXI_SOURCE_URL } from "@/lib/ingestion/peru-oxi-mapper";
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
  sample: Tender[];
};

export type PeruIngestOptions = {
  write: boolean;
  /** Calendar-month segments to fetch (OECE only). Ignored when `segment` is set. */
  months?: number;
  /** Rolling window in days, applied to what was fetched. 0/undefined = use `months`. */
  days?: number;
  /** One specific `YYYY-MM` segment (OECE only). */
  segment?: string;
  /** Server-side category filter (OECE only) — normally left unset; lib/relevance.ts decides what is worth keeping. */
  category?: "goods" | "works" | "services";
  sourceId?: string;
  /** Return every kept row, not just the top five — the CLI's classification report needs all of them. */
  preview?: boolean;
};

function summarize(
  source: "oece" | "oxi",
  fetchedCount: number,
  mapped: Tender[],
  kept: Tender[],
  options: { write: boolean; segments?: string[]; preview?: boolean },
): PeruIngestResult {
  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of kept) tierCounts[tender.relevance.tier] += 1;
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
  const segments = options.segment ? [options.segment] : recentSegmentIds(months);
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
 * ProInversión Obras por Impuestos.
 *
 * `file` lets a caller pass an export a human downloaded, bypassing the
 * network — the fallback for the day investinperu.pe changes its endpoint.
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

  const rows = await readPeruOxiFile({ buffer, fileName: options.file?.fileName ?? "oxi-export.xlsx" });
  const mapped = rows
    .map((row) => mapPeruOxiRowToTender(row, PERU_OXI_SOURCE_NAME, PERU_OXI_SOURCE_URL))
    .filter((tender): tender is Tender => tender !== null);
  // The export is a snapshot of what is open right now, so months defaults to
  // 0 (no filter): a convocatoria that closes drops out of the next export
  // rather than ageing inside this one. --days still narrows it on request.
  const kept = applyRecency(mapped, options, 0);
  const result = summarize("oxi", rows.length, mapped, kept, { write: options.write, preview: options.preview });

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  return writeOut(supabase, kept, result);
}
