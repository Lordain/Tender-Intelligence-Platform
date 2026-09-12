import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/**
 * Reads Ecopetrol's real "Convocatorias públicas en Ley de Garantías"
 * table (proveedores.ecopetrol.com.co — confirmed public/no-login by the
 * user directly, unlike the rest of that supplier portal — see
 * README.md). The page renders the full table server-side (a DataTables
 * widget, not a separate fetched API), so the intake here is a plain
 * tab-separated copy-paste of the visible table (header: "Número de
 * trámite\tObjeto\tFecha apertura del trámite\tFecha cierre del
 * trámite\tEstado\tAcciones") — the same "read what a human copied out of
 * their own browser session" posture as every other connector in this
 * project, not a scraper.
 *
 * Real, important scope caveat (confirmed by the user, not assumed): "Ley
 * de Garantías" is Colombia's pre-election restricted-contracting
 * disclosure law — this page only lists convocatorias published under
 * that legally-mandated window, and the user directly observed no rows
 * past June 2026 once that window closed. This is NOT Ecopetrol's general,
 * year-round public tender feed — it is a real, valuable, but
 * time-bounded batch, not a continuously live source. A general feed (if
 * one exists) would live under the portal's "Procesos" section instead —
 * not checked yet.
 */
export type EcopetrolConvocatoriaRow = {
  "Número de trámite": string;
  Objeto: string;
  "Fecha apertura del trámite": string;
  "Fecha cierre del trámite": string;
  Estado: string;
  Acciones?: string;
};

export function readEcopetrolConvocatoriasFile(filePath: string): EcopetrolConvocatoriaRow[] {
  const content = readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    delimiter: "\t",
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as EcopetrolConvocatoriaRow[];
}
