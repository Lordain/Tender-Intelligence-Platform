import type { Tender } from "@/types/tender";
import { mapComprasMxOpenTenderRowToTender, type ComprasMxOpenTenderRow } from "@/lib/ingestion/compras-mx-open-tenders-mapper";
import { classifyRelevance } from "@/lib/relevance";
import { slugify } from "@/lib/ingestion/text-utils";

/**
 * "Proyectos Estratégicos MX" (proyectosestrategicosmx.hacienda.gob.mx) —
 * a Hacienda-run procurement portal for projects under the "Ley para el
 * Fomento de la Inversión en Infraestructura Estratégica para el
 * Desarrollo con Bienestar." A DIFFERENT system from both Compras MX and
 * "Proyectos México" (Banobras/SHCP) — confirmed real (2026-09-03) by the
 * user finding a real tender there (FP-16-B00-016B00985-N-6-2026,
 * CONAGUA's "Presa Mujer Solteca" acueducto) that Compras MX's own search
 * doesn't have at all, and separately confirming Proyectos México's own
 * project pages link out to this site once a project reaches actual
 * bidding — i.e. this IS the real procurement destination for a
 * Proyectos México pipeline listing, not an unrelated third system.
 *
 * Its export button produces the EXACT SAME "Información Pública" export
 * format as Compras MX's own "Difusión de procedimientos" export —
 * confirmed against a real file the user downloaded: identical column
 * headers (NÚM./NÚMERO DE IDENTIFICACIÓN/CARÁCTER/NOMBRE/SIGLAS
 * DEPENDENCIA O ENTIDAD/ESTATUS/FECHA JUNTA DE ACLARACIONES/FECHA DE
 * PRESENTACIÓN Y APERTURA DE PROPOSICIONES/TIPO DE PUBLICACIÓN/TIPO DE
 * CONTRATACIÓN/CÓDIGO DE EXPEDIENTE/UNIDAD COMPRADORA/ENTIDAD
 * FEDERATIVA), same "Informaci_nP_blica_export_*.xlsx" filename pattern —
 * this portal runs on the same government web platform as Compras MX,
 * just scoped to this specific investment law. So this mapper reuses
 * compras-mx-open-tenders-mapper.ts's field-parsing wholesale (same row
 * type, same inference rules — reading readComprasMxOpenTendersFile's
 * output directly, no separate file reader needed) rather than
 * duplicating it, and only overrides what's genuinely different for this
 * source:
 * - slug prefix: own namespace (`proyectosestrategicos-`), not
 *   `comprasmx-` — these procedure numbers never actually appear in a
 *   real Compras MX export, so sharing that prefix would be misleading,
 *   not just redundant.
 * - isNationalPriorityProject: true — same reasoning as
 *   proyectos-mexico-mapper.ts: being listed under this strategic-
 *   infrastructure law IS the flagship signal, stronger than any
 *   keyword/value proxy.
 *
 * Supersedes proyectos-mexico-mapper.ts's ingestion (2026-09-03, per the
 * user's explicit decision — the 57 previously-ingested "Proyectos
 * México (Banobras/SHCP)" rows were deleted from Supabase, not kept
 * alongside this). Proyectos México only ever listed the investment-
 * pipeline stage with no downloadable bidding documents; this source
 * lists the same real projects once they reach actual bidding, WITH real
 * Convocatoria/Anexo attachments — a strictly more useful source for
 * this platform's purpose.
 */
export function mapProyectosEstrategicosRowToTender(
  row: ComprasMxOpenTenderRow,
  sourceName: string,
  sourceUrl: string,
): Tender | null {
  const base = mapComprasMxOpenTenderRowToTender(row, sourceName, sourceUrl);
  if (!base) return null;

  return {
    ...base,
    slug: `proyectosestrategicos-${slugify(base.tenderNumber)}`,
    relevance: classifyRelevance({
      title: row["NOMBRE"]?.trim() ?? "",
      industries: base.industries,
      scopeType: base.scopeType,
      buyer: base.buyer,
      isNationalPriorityProject: true,
    }),
  };
}
