import { readFileSync } from "node:fs";
import type { SecopProcesoRow } from "@/lib/ingestion/colombia-mapper";

/**
 * Reads a locally-saved response from Colombia's real, unauthenticated
 * SECOP II Socrata endpoint (see colombia-mapper.ts for the confirmed
 * real URL and details). Real captures decode as plain UTF-8 JSON — a
 * standard Socrata `/resource/<id>.json` response is a plain array, not
 * wrapped in an envelope object the way some of the Mexican sources are.
 */
export function readColombiaSecopFile(filePath: string): SecopProcesoRow[] {
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content) as SecopProcesoRow[];
  return Array.isArray(data) ? data : [];
}
