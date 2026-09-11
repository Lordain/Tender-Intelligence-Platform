/**
 * Core logic behind the admin "新项目清单" upload page
 * (app/admin/import-tenders/) and, going forward, the ingest:comprasmx-
 * open / ingest:proyectos-estrategicos CLI scripts — shared so the web
 * form and the CLI write to Supabase through exactly the same path.
 *
 * The two Mexican sources share the exact same export file format
 * (confirmed byte-identical columns, see lib/ingestion/README.md's
 * "Proyectos Estratégicos MX" section) and reader
 * (readComprasMxOpenTendersFile), differing only in mapper, source name and
 * source URL. Peru's Obras por Impuestos export is a different file
 * entirely, so each source now owns a `load` step that pairs its own reader
 * with its own mapper, rather than the reader being hardcoded here.
 */
import { readComprasMxOpenTendersFile } from "@/lib/ingestion/connectors/compras-mx-open-tenders-file";
import { readPeruOxiFile } from "@/lib/ingestion/connectors/peru-oxi-file";
import { mapPeruOxiRowToTender, PERU_OXI_SOURCE_NAME, PERU_OXI_SOURCE_URL } from "@/lib/ingestion/peru-oxi-mapper";
import { mapComprasMxOpenTenderRowToTender } from "@/lib/ingestion/compras-mx-open-tenders-mapper";
import { mapProyectosEstrategicosRowToTender } from "@/lib/ingestion/proyectos-estrategicos-mapper";
import { filterRecentTenders, filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Tender } from "@/types/tender";
import { NATIONAL_PRIORITY_SOURCE_NAME } from "@/lib/relevance";
import { type NewTendersSource, type ImportNewTendersResult } from "@/lib/ingestion/new-tenders-sources";

export type { NewTendersSource, ImportNewTendersResult } from "@/lib/ingestion/new-tenders-sources";
export { NEW_TENDERS_SOURCES } from "@/lib/ingestion/new-tenders-sources";

type SourceConfig = {
  sourceName: string;
  sourceUrl: string;
  /** Reads the source's own export format and maps it, so a reader change never leaks into the shared flow below. */
  load: (file: { buffer: Buffer; fileName: string }) => Promise<{ totalRows: number; mapped: Tender[] }>;
};

function comprasMxFamily(sourceName: string, sourceUrl: string, map: typeof mapComprasMxOpenTenderRowToTender): SourceConfig {
  return {
    sourceName,
    sourceUrl,
    load: async (file) => {
      const rows = await readComprasMxOpenTendersFile(file);
      return { totalRows: rows.length, mapped: rows.map((row) => map(row, sourceName, sourceUrl)).filter((t): t is Tender => t !== null) };
    },
  };
}

const SOURCE_CONFIG: Record<NewTendersSource, SourceConfig> = {
  "comprasmx-open": comprasMxFamily(
    "Compras MX — Difusión de procedimientos (exportación pública)",
    "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/",
    mapComprasMxOpenTenderRowToTender,
  ),
  "proyectos-estrategicos": comprasMxFamily(
    NATIONAL_PRIORITY_SOURCE_NAME,
    "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/",
    mapProyectosEstrategicosRowToTender,
  ),
  "peru-oxi": {
    sourceName: PERU_OXI_SOURCE_NAME,
    sourceUrl: PERU_OXI_SOURCE_URL,
    load: async (file) => {
      const rows = await readPeruOxiFile(file);
      return {
        totalRows: rows.length,
        mapped: rows
          .map((row) => mapPeruOxiRowToTender(row, PERU_OXI_SOURCE_NAME, PERU_OXI_SOURCE_URL))
          .filter((t): t is Tender => t !== null),
      };
    },
  },
};

export async function importNewTenders(
  source: NewTendersSource,
  file: { buffer: Buffer; fileName: string },
  options: { write: boolean; months?: number; days?: number; preview?: boolean },
): Promise<ImportNewTendersResult> {
  const config = SOURCE_CONFIG[source];
  const months = options.months ?? 6;

  const { totalRows, mapped } = await config.load(file);
  const kept = options.days && options.days > 0
    ? filterTendersPublishedWithinDays(mapped, options.days)
    : filterRecentTenders(mapped, months);

  const result: ImportNewTendersResult = {
    totalRows,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    months,
    sample: kept.slice(0, 5),
    // The admin form only ever renders `sample`; a CLI dry run wants every
    // kept row so it can report the classification over the whole file.
    ...(options.preview ? { preview: kept } : {}),
  };

  if (!options.write) return result;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
