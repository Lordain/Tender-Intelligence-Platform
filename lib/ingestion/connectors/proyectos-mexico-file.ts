import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type { ProyectosMexicoRow } from "@/lib/ingestion/proyectos-mexico-mapper";

/**
 * Reads a locally-downloaded proyectosmexico.gob.mx/proyectos/ export
 * (the page's own CSV/PDF export buttons — see
 * lib/ingestion/proyectos-mexico-mapper.ts). Confirmed real: UTF-8 with
 * a BOM (`csv-parse`'s `bom: true` strips it), and — same real gap
 * `compras-mx-contracts-bulk-file.ts` found — at least one field with a
 * mangled/non-ASCII byte in a header name ("Área responsable" decodes
 * with a corrupted "Á" in the real file) rather than an escaping
 * problem, so `relax_quotes` is enabled defensively for the same reason
 * it is on every other government CSV reader in this project.
 *
 * Dispatches on real file content, NOT the file extension (2026-09-02,
 * after a real capture came back as `Proyectos – Proyectos México.xls`
 * despite the user having clicked the page's CSV export button) — a
 * `.xls`-named download whose actual bytes are still plain CSV text is a
 * common real-world server misconfiguration (a wrong `Content-Type`
 * header on the export response), not a genuine binary Excel file.
 * Checks for the real ZIP magic bytes (`PK\x03\x04`) that a true
 * `.xlsx` (OOXML) file always starts with; anything else is parsed as
 * CSV regardless of what the file happens to be named. Legacy binary
 * `.xls` (pre-2007 BIFF format, a different real binary structure this
 * project has no reader for) would fail this same way — if that's ever
 * the real cause, re-export as CSV or `.xlsx` from the site instead.
 */
export async function readProyectosMexicoFile(filePath: string): Promise<ProyectosMexicoRow[]> {
  const buffer = readFileSync(filePath);
  const isRealXlsx = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

  if (isRealXlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    const headerRow = worksheet.getRow(1).values as (string | undefined)[];
    // ExcelJS rows are 1-indexed and `.values` has a leading empty slot at
    // index 0 — headers/cells both need that same one-based offset.
    const headers = headerRow.slice(1).map((h) => (h ?? "").toString());

    const rows: ProyectosMexicoRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as (string | number | undefined)[];
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        const cell = values[i + 1];
        if (header) record[header] = cell === undefined || cell === null ? "" : String(cell);
      });
      rows.push(record as ProyectosMexicoRow);
    });
    return rows;
  }

  const content = new TextDecoder("utf-8").decode(buffer);
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
  }) as ProyectosMexicoRow[];
}
