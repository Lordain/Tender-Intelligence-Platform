import { readFileSync } from "node:fs";
import type { DofSearchNota } from "@/lib/ingestion/dof-search-mapper";

type DofSearchResponse = {
  messageCode: number;
  totalRegistros: number;
  Notas?: DofSearchNota[];
};

/** Reads a locally-saved DOF advanced-search response (captured from a browser — see README.md). Real captures decode as plain UTF-8 (this endpoint, unlike the daily-edition one, didn't need a latin-1 fallback in what's been seen so far, but the same try/fallback pattern is kept for safety). */
export function readDofSearchFile(filePath: string): DofSearchNota[] {
  const buffer = readFileSync(filePath);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    content = new TextDecoder("latin1").decode(buffer);
  }
  const data = JSON.parse(content) as DofSearchResponse;
  return data.Notas ?? [];
}
