import ExcelJS from "exceljs";
import type { PeruOxiRow } from "@/lib/ingestion/peru-oxi-mapper";

/**
 * Reads ProInversión's "Lista de convocatorias en proceso de selección bajo
 * Obras por Impuestos" export — the file behind the "Exportar a Excel" button
 * on investinperu.pe's Obras por impuestos page.
 *
 * Confirmed real (2026-09-11) against a file the user downloaded themselves:
 * one sheet, `OXI-CONVOCATORIA_PROCESO`, 422 rows, "Última actualización:
 * 10/09/2026" — one day old.
 *
 * The layout is a report, not a table: rows 1-4 blank, row 6 the title, row 7
 * "Última actualización", row 8 "Nº Registros", row 10 the real header, data
 * from row 11, and a blank leading column A throughout. So the header row is
 * FOUND rather than assumed at a fixed index — a report header that gains or
 * loses a line is exactly the kind of change that would otherwise map every
 * column one row off in silence.
 */
const HEADER_ANCHOR = "Codigo Convocatoria";
const MAX_HEADER_SEARCH_ROWS = 40;

export async function readPeruOxiFile(file: string | { buffer: Buffer; fileName: string }): Promise<PeruOxiRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (typeof file === "string") {
    await workbook.xlsx.readFile(file);
  } else {
    await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  /**
   * Two of this export's columns are real Excel HYPERLINK cells, not text:
   * "Enlace Portal web ProInversión" carries each convocatoria's own detail
   * page on investinperu.pe, and "Enlace SSI MEF" its investment record at
   * MEF. ExcelJS hands those back as `{ text, hyperlink }`, which a bare
   * String() turns into "[object Object]" — which is exactly what happened on
   * the first pass, and is why this source looked like it had no per-row link
   * when in fact every row carries one. The URL is the useful half, so it
   * wins; richText cells fall back to their concatenated runs.
   */
  const cellText = (value: ExcelJS.CellValue): string => {
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === "object") {
      const hyperlink = (value as ExcelJS.CellHyperlinkValue).hyperlink;
      if (typeof hyperlink === "string") return hyperlink.trim();
      const richText = (value as ExcelJS.CellRichTextValue).richText;
      if (Array.isArray(richText)) return richText.map((run) => run.text ?? "").join("").trim();
      const text = (value as { text?: unknown }).text;
      if (typeof text === "string") return text.trim();
    }
    return String(value ?? "").trim();
  };

  let headerRowNumber = 0;
  const headers: string[] = [];
  for (let n = 1; n <= Math.min(MAX_HEADER_SEARCH_ROWS, worksheet.rowCount); n += 1) {
    const row = worksheet.getRow(n);
    let found = false;
    row.eachCell((cell) => {
      if (cellText(cell.value) === HEADER_ANCHOR) found = true;
    });
    if (found) {
      headerRowNumber = n;
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = cellText(cell.value);
      });
      break;
    }
  }
  if (headerRowNumber === 0) {
    throw new Error(
      `Could not find the "${HEADER_ANCHOR}" header in the first ${MAX_HEADER_SEARCH_ROWS} rows of the OxI export. ` +
        "ProInversión has probably changed the export layout — re-check the file before trusting an import.",
    );
  }

  const rows: PeruOxiRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const record: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      record[header] = cellText(cell.value);
    });
    // The export ends with a source-attribution footnote ("Fuente y
    // Elaboración: Dirección de Inversiones Descentralizadas – ProInversión
    // ...") that lands in the same column as the convocatoria code, so a
    // non-empty check alone counted it as a 423rd tender. Real codes are
    // CONV + year + sequence.
    if (/^CONV\d+$/i.test(record[HEADER_ANCHOR] ?? "")) rows.push(record as unknown as PeruOxiRow);
  });

  return rows;
}
