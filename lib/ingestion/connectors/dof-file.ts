import { readFileSync } from "node:fs";
import type { DofNota } from "@/lib/ingestion/dof-mapper";

type DofNotasResponse = {
  messageCode: number;
  NotasMatutinas?: DofNota[];
  NotasVespertinas?: DofNota[];
  NotasExtraordinarias?: DofNota[];
};

/**
 * Reads a locally-saved DOF daily-edition JSON response (captured from a
 * browser, same manual-retrieval pattern as every other source here — see
 * README.md). Real files the user provided decode as latin-1, not UTF-8
 * (confirmed: UTF-8 throws on them) — the same utf-8-first-then-fallback
 * pattern the Compras MX readers use, just with latin-1 as the fallback
 * instead of GB18030 since that's what these actually are.
 */
export function readDofNotasFile(filePath: string): DofNota[] {
  const buffer = readFileSync(filePath);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    content = new TextDecoder("latin1").decode(buffer);
  }
  const data = JSON.parse(content) as DofNotasResponse;

  return [
    ...(data.NotasMatutinas ?? []),
    ...(data.NotasVespertinas ?? []),
    ...(data.NotasExtraordinarias ?? []),
  ];
}
