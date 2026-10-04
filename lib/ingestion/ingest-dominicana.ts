/**
 * Dominican Republic ingestion — the DGCP open-data API, for the daily job
 * (scripts/cron-dominicana.ts). Added 2026-10-04, staged, and opened to
 * visitors the same day.
 *
 * Reads every procedure published in the window, keeps the public tenders
 * (DOMINICANA_INGESTED_MODALIDADES) that are still taking bids, classifies
 * them by the platform's general rules and writes only what those keep,
 * with each kept tender's pliego and annexes as document links.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import {
  DOMINICANA_INGESTED_MODALIDADES,
  fetchDgcpDocumentos,
  fetchDgcpProcesos,
  type DgcpDocumento,
  type DgcpProceso,
} from "@/lib/ingestion/connectors/dominicana-dgcp-live";
import { DOMINICANA_SOURCE_NAME, dominicanDocumentLinks, mapDgcpProcesoToTender } from "@/lib/ingestion/dominicana-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { runPool } from "@/lib/ingestion/run-pool";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";

export { DOMINICANA_SOURCE_NAME };

export type DominicanaIngestResult = {
  /** Every procedure the API returned for the window, all modalities. */
  listedCount: number;
  /** Public tenders among them (LPN / LPI / LPA). */
  publicTenderCount: number;
  rows: { proceso: DgcpProceso; tender: Tender }[];
  kept: Tender[];
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  documentLinks?: number;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function ingestDominicana(
  supabase: SupabaseClient | null,
  options: {
    write: boolean;
    /** Publication window, days back from today. The daily job uses the shared 3-day window. */
    days?: number;
    now?: Date;
    fetchProcesos?: (start: string, end: string) => Promise<DgcpProceso[]>;
    fetchDocumentos?: (codigo: string) => Promise<DgcpDocumento[]>;
  },
): Promise<DominicanaIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const procesos = await (options.fetchProcesos ?? fetchDgcpProcesos)(isoDay(start), isoDay(now));

  const seen = new Set<string>();
  const publicTenders = procesos.filter((proceso) => {
    if (!DOMINICANA_INGESTED_MODALIDADES.test(proceso.modalidad ?? "") || seen.has(proceso.codigo_proceso)) return false;
    seen.add(proceso.codigo_proceso);
    return true;
  });
  const rows = publicTenders.map((proceso) => ({ proceso, tender: mapDgcpProcesoToTender(proceso, now) }));
  // Still taking bids, and kept by the rules.
  const kept = rows.filter((row) => row.tender.status === "open" && row.tender.relevance.tier !== "excluded").map((row) => row.tender);

  const result: DominicanaIngestResult = { listedCount: procesos.length, publicTenderCount: publicTenders.length, rows, kept, write: options.write };
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");

  const { upsertedCount, failed } = await upsertTendersBatched(supabase, kept);
  const keptCodes = new Set(kept.map((tender) => tender.tenderNumber));
  const links: { slug: string; links: ReturnType<typeof dominicanDocumentLinks> }[] = [];
  await runPool(
    rows.filter((row) => keptCodes.has(row.proceso.codigo_proceso)),
    4,
    async (row) => {
      try {
        const documentos = await (options.fetchDocumentos ?? fetchDgcpDocumentos)(row.proceso.codigo_proceso);
        if (documentos.length > 0) links.push({ slug: row.tender.slug, links: dominicanDocumentLinks(documentos) });
      } catch {
        // A missing document list costs the links, not the tender.
      }
    },
  );
  const saved = links.length > 0 ? await saveDocumentLinks(supabase, links) : null;
  return { ...result, upsertedCount, failed, documentLinks: saved?.linkCount ?? 0 };
}
