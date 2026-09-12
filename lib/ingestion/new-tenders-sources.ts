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

/**
 * Mexico only, on purpose. This registry drives the file-upload dropdown on
 * the 墨西哥 tab, and the user's standing rule for that page is that countries
 * stay apart: "新项目清单还是要分国家，不要把秘鲁墨西哥做在一起" (2026-09-11).
 * Peru has its own tab and its own live-fetch form
 * (components/admin/ImportPeruForm.tsx) — it needs no file upload at all, so
 * it does not belong in this list even though its mapper briefly lived here.
 */

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
  /** Every kept row, not just the first five — only populated for a CLI dry run (see importNewTenders' `preview` option). */
  preview?: Tender[];
};
