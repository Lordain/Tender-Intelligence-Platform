import { readFileSync } from "node:fs";
import type { OeceRecordPackage } from "@/lib/ingestion/peru-oece-mapper";

/**
 * Reads an already-extracted real OECE (Peru) record package JSON file —
 * the file a human gets after downloading
 * `GET /file/{source}/json/{year}/{month}` from
 * `contratacionesabiertas.oece.gob.pe/api/v1` and unzipping it locally
 * (the real API response is a ZIP, not raw JSON — see
 * peru-oece-mapper.ts). Manual/offline fallback; `ingest-peru-live.ts`
 * does the fetch-and-unzip automatically.
 */
export function readPeruOeceFile(filePath: string): OeceRecordPackage {
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content) as OeceRecordPackage;
  return { records: Array.isArray(data.records) ? data.records : [] };
}
