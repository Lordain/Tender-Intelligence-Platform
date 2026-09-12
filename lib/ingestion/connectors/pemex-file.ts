import { readFileSync } from "node:fs";
import type { PemexConcursoItem } from "@/lib/ingestion/pemex-mapper";

/**
 * Reads a locally-saved PEMEX "Concursos Abiertos" SharePoint REST export —
 * a plain JSON array (the `d.value` array from a `$select=...` OData
 * `nometadata` response, saved via a browser Console `fetch()` + Blob
 * download; see README.md). Real captures are plain UTF-8 JSON.
 */
export function readPemexFile(filePath: string): PemexConcursoItem[] {
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content) as PemexConcursoItem[];
  return Array.isArray(data) ? data : [];
}
