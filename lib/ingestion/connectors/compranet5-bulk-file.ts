import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type { Compranet5Row } from "@/lib/ingestion/compranet5-mapper";

/**
 * Reads a locally-downloaded CompraNet 5.0 bulk export (CSV or XLSX) from
 * comprasmx.buengobierno.gob.mx/datos-abiertos into rows keyed by the
 * confirmed column names from DD_HISTORICO_CNET5.xlsx. This is a real
 * official open-data file the user downloads by hand — not fetched over
 * the network by this code, so it sidesteps the "can this session verify a
 * live API" problem entirely (see lib/ingestion/README.md).
 */
export async function readCompranet5BulkFile(filePath: string): Promise<Compranet5Row[]> {
  if (filePath.endsWith(".csv")) {
    // Confirmed real: this file decodes as latin-1, NOT the gb18030 the
    // Compras MX Datos Abiertos contracts export uses (see
    // compras-mx-contracts-bulk-file.ts) — a different real encoding for a
    // different real government export, not a guess. Reading as plain
    // "utf-8" (the previous behavior) silently mangled every accented
    // column name (e.g. "Institución" -> "Instituci�n"), which meant every
    // row lookup in compranet5-mapper.ts missed its expected key and the
    // whole file mapped to zero tenders — caught by actually running this
    // against a real 13,400-row file for the first time, not in review.
    const buffer = readFileSync(filePath);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      content = new TextDecoder("latin1").decode(buffer);
    }
    // relax_quotes: a real Compras MX contracts export has at least one
    // unquoted field with an embedded literal quote that strict csv-parse
    // rejects outright (see compras-mx-contracts-bulk-file.ts) — applying
    // the same defensive option here since this reads the same family of
    // government exports.
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as Compranet5Row[];
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: Compranet5Row[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const record: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = cell.value;
      record[header] = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
    });
    if (Object.keys(record).length > 0) rows.push(record as unknown as Compranet5Row);
  });

  return rows;
}
