import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { ProyectosMexicoRow } from "@/lib/ingestion/proyectos-mexico-mapper";

/**
 * Reads a locally-downloaded proyectosmexico.gob.mx/proyectos/ CSV
 * export (the page's own CSV export button — see
 * lib/ingestion/proyectos-mexico-mapper.ts). Confirmed real: UTF-8 with
 * a BOM (`csv-parse`'s `bom: true` strips it), and — same real gap
 * `compras-mx-contracts-bulk-file.ts` found — at least one field with a
 * mangled/non-ASCII byte in a header name ("Área responsable" decodes
 * with a corrupted "Á" in the real file) rather than an escaping
 * problem, so `relax_quotes` is enabled defensively for the same reason
 * it is on every other government CSV reader in this project.
 */
export function readProyectosMexicoFile(filePath: string): ProyectosMexicoRow[] {
  const buffer = readFileSync(filePath);
  const content = new TextDecoder("utf-8").decode(buffer);

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
  }) as ProyectosMexicoRow[];
}
