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
 * source URL. Each source still owns a `load` step pairing its own reader
 * with its own mapper rather than the reader being hardcoded here — Peru's
 * Obras por Impuestos briefly lived here and proved the seam worth keeping,
 * before moving to its own country tab and its own live fetch
 * (lib/ingestion/ingest-peru.ts).
 */
import { readComprasMxOpenTendersFile } from "@/lib/ingestion/connectors/compras-mx-open-tenders-file";
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
};

/**
 * Proyectos Estratégicos procedure numbers start FP-; ordinary Compras MX
 * ones start LA-/LO-/IA-/IO-/AA-/AO-.
 *
 * The two portals export the IDENTICAL file format, read by the identical
 * reader, so until now nothing could tell which portal a file came from and
 * picking the wrong option in the dropdown was invisible. It happened, and
 * the damage is silent and permanent: the two sources use different slug
 * namespaces on purpose (proyectos-estrategicos-mapper.ts), so the same
 * procedure imported under the wrong one becomes a SECOND row rather than
 * updating the first. 26 duplicate pairs were found in production on
 * 2026-09-12, every one of them an FP- number sitting under both prefixes —
 * the user's own diagnosis: 我之前导入时选错了数据来源.
 *
 * A wrong choice is refused rather than warned about, because the person who
 * would read a warning is the same person who just picked the wrong option.
 * Preview is untouched; only writing is blocked.
 */
const STRATEGIC_PROJECT_NUMBER = /^FP-/i;

function assertSourceMatchesFile(source: NewTendersSource, mapped: Tender[]): void {
  if (mapped.length === 0) return;
  const strategic = mapped.filter((t) => STRATEGIC_PROJECT_NUMBER.test(t.tenderNumber.trim())).length;
  const share = strategic / mapped.length;

  if (source === "comprasmx-open" && share > 0.5) {
    throw new Error(
      `这个文件里 ${strategic}/${mapped.length} 条的招标编号是 FP- 开头，那是「Proyectos Estratégicos MX」的编号，不是 Compras MX 的。` +
        `数据来源选错了——请改选「Proyectos Estratégicos MX」再导入。（选错会生成一份重复的项目，而不是更新原有的。）`,
    );
  }
  if (source === "proyectos-estrategicos" && share < 0.5) {
    throw new Error(
      `这个文件里只有 ${strategic}/${mapped.length} 条是 FP- 开头的编号，不像「Proyectos Estratégicos MX」的导出。` +
        `数据来源可能选错了——如果这是 Compras MX 的导出，请改选「Compras MX — 开放招标」。`,
    );
  }
}

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

  // After the preview is built, before anything is written: a dry run should
  // still show what the file contains even when the source is wrong.
  assertSourceMatchesFile(source, mapped);

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
