/**
 * Client-safe types/constants for the "新项目清单" admin page
 * (ImportTendersForm.tsx). Deliberately split out of import-new-
 * tenders.ts — that file imports the file readers (readFileSync, node:fs)
 * transitively, and a "use client" component importing anything from it
 * (even just for its types) pulls that server-only code into the browser
 * bundle, which Turbopack rejects outright ("the chunking context does
 * not support external modules (request: node:fs)", a real build failure
 * hit 2026-09-04). This file has zero Node-only dependencies, so it's
 * safe for both the client form and the server-side import-new-
 * tenders.ts to import.
 */
import type { Tender } from "@/types/tender";

export type NewTendersSource = "comprasmx-open" | "proyectos-estrategicos";

export const NEW_TENDERS_SOURCES: { value: NewTendersSource; label: string }[] = [
  { value: "comprasmx-open", label: "Compras MX — 开放招标（Difusión de procedimientos）" },
  { value: "proyectos-estrategicos", label: "Proyectos Estratégicos MX (Hacienda)" },
];

export type ImportNewTendersResult = {
  totalRows: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};
