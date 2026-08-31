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
    const content = readFileSync(filePath, "utf-8");
    return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as Compranet5Row[];
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
