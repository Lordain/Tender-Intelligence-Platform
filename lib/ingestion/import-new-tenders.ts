/**
 * Core logic behind the admin "新项目清单" upload page
 * (app/admin/import-tenders/) and, going forward, the ingest:comprasmx-
 * open / ingest:proyectos-estrategicos CLI scripts — shared so the web
 * form and the CLI write to Supabase through exactly the same path.
 *
 * Both real sources this covers share the exact same export file format
 * (confirmed byte-identical columns, see lib/ingestion/README.md's
 * "Proyectos Estratégicos MX" section) and reader
 * (readComprasMxOpenTendersFile), so one function handles both — only the
 * mapper, source name, and source URL differ per source.
 */
import { readComprasMxOpenTendersFile } from "@/lib/ingestion/connectors/compras-mx-open-tenders-file";
import { mapComprasMxOpenTenderRowToTender } from "@/lib/ingestion/compras-mx-open-tenders-mapper";
import { mapProyectosEstrategicosRowToTender } from "@/lib/ingestion/proyectos-estrategicos-mapper";
import { filterRecentTenders } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Tender } from "@/types/tender";
import { type NewTendersSource, type ImportNewTendersResult } from "@/lib/ingestion/new-tenders-sources";

export type { NewTendersSource, ImportNewTendersResult } from "@/lib/ingestion/new-tenders-sources";
export { NEW_TENDERS_SOURCES } from "@/lib/ingestion/new-tenders-sources";

const SOURCE_CONFIG: Record<
  NewTendersSource,
  { sourceName: string; sourceUrl: string; map: (row: Parameters<typeof mapComprasMxOpenTenderRowToTender>[0], sourceName: string, sourceUrl: string) => Tender | null }
> = {
  "comprasmx-open": {
    sourceName: "Compras MX — Difusión de procedimientos (exportación pública)",
    sourceUrl: "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/",
    map: mapComprasMxOpenTenderRowToTender,
  },
  "proyectos-estrategicos": {
    sourceName: "Proyectos Estratégicos MX (Hacienda)",
    sourceUrl: "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/",
    map: mapProyectosEstrategicosRowToTender,
  },
};

export async function importNewTenders(
  source: NewTendersSource,
  file: { buffer: Buffer; fileName: string },
  options: { write: boolean; months?: number },
): Promise<ImportNewTendersResult> {
  const config = SOURCE_CONFIG[source];
  const months = options.months ?? 6;

  const rows = await readComprasMxOpenTendersFile(file);
  const mapped = rows.map((row) => config.map(row, config.sourceName, config.sourceUrl)).filter((t): t is Tender => t !== null);
  const kept = filterRecentTenders(mapped, months);

  const result: ImportNewTendersResult = {
    totalRows: rows.length,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    months,
    sample: kept.slice(0, 5),
  };

  if (!options.write) return result;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
