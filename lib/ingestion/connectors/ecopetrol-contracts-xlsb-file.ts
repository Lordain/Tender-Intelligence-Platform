import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

/**
 * Reads Ecopetrol's real "Contratación asignada a la fecha" export — a
 * genuinely public disclosure page, no login required (confirmed real:
 * https://www.ecopetrol.com.co/wps/portal/Home/es/GruposInteres/GestionDeAbastecimiento/Gestioncontractual/ContratacionAsignadaFecha).
 * NOT the same as proveedores.ecopetrol.com.co (the supplier portal,
 * confirmed to require login — see README.md).
 *
 * Real file shape confirmed against `contratacion-corte-jun2026.xlsb`
 * (real, .xlsb binary Excel format): one sheet per year (2016–2026), each
 * with a title row, a blank row, then the real header row — found by
 * content ("Objeto Contrato"), not a hardcoded row index, since that
 * offset isn't guaranteed stable and the column set itself genuinely
 * varies by year (2016's sheet has 15 columns, 2024–2026 have 17,
 * including two whose names are year-suffixed —
 * "Valor Suscrito en Ordenes Despacho en Pesos en <YEAR>" and
 * "Valor Ejecutado en <YEAR>" — so this reads by real header text into a
 * loose row type rather than a fixed interface).
 */
export type EcopetrolContractRow = Record<string, string | number | undefined>;

export function readEcopetrolContractsFile(filePath: string, sheetName?: string): EcopetrolContractRow[] {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  // Defaults to the LAST sheet (real sheets are ordered oldest to newest
  // year — "2016", "2017", ..., "2026" — confirmed against the real file),
  // i.e. the most current year, unless a specific one is requested.
  const targetSheet = sheetName ?? workbook.SheetNames[workbook.SheetNames.length - 1];
  const sheet = workbook.Sheets[targetSheet];
  if (!sheet) {
    throw new Error(`Sheet "${targetSheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
  const headerRowIndex = raw.findIndex((row) => row.some((cell) => cell === "Objeto Contrato"));
  if (headerRowIndex === -1) {
    throw new Error(`Could not find the real header row (looking for "Objeto Contrato") in sheet "${targetSheet}".`);
  }

  const headers = raw[headerRowIndex] as string[];
  return raw.slice(headerRowIndex + 1).map((row) => {
    const record: EcopetrolContractRow = {};
    headers.forEach((header, i) => {
      if (header) record[header] = row[i] as string | number | undefined;
    });
    return record;
  });
}
