import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type { ComprasMxOpenTenderRow } from "@/lib/ingestion/compras-mx-open-tenders-mapper";

/**
 * Reads a locally-exported "Difusión de procedimientos" file (the public
 * search page's own browser Excel export — see
 * compras-mx-open-tenders-mapper.ts for why this, and not the page's JSON
 * API, is the source). Supports both the .xlsx export and a .csv in case a
 * future export comes in that shape; CSV falls back to GB18030 the same
 * way the other Compras MX bulk readers do, since that's the encoding real
 * exports from this portal have arrived in before.
 */
export async function readComprasMxOpenTendersFile(filePath: string): Promise<ComprasMxOpenTenderRow[]> {
  if (filePath.endsWith(".csv")) {
    const buffer = readFileSync(filePath);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      content = new TextDecoder("gb18030").decode(buffer);
    }
    // relax_quotes: a real Compras MX contracts export has at least one
    // unquoted field with an embedded literal quote that strict csv-parse
    // rejects outright (see compras-mx-contracts-bulk-file.ts) — applying
    // the same defensive option here in case a future CSV export of this
    // file has the same issue.
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as ComprasMxOpenTenderRow[];
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

  const rows: ComprasMxOpenTenderRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const record: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = cell.value;
      record[header] = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
    });
    if (Object.keys(record).length > 0) rows.push(record as unknown as ComprasMxOpenTenderRow);
  });

  return rows;
}
