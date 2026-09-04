/**
 * Client-safe types/constants for the "DOF 直接拉取" admin section
 * (ImportDofSearchForm.tsx) — split out of import-dof-search-live.ts the
 * same way pemex-sources.ts was split out of import-pemex-live.ts, to keep
 * a "use client" component from transitively importing server-only code
 * (createSupabaseAdminClient, upsert-tenders.ts) into the browser bundle.
 */
import type { Tender } from "@/types/tender";

// Real default captured from the user's own "Copy as cURL" of the advanced
// search page (2026-09-04) — every branch of government the search page's
// own UI lets you select, comma-joined exactly as the real request sends it.
export const DEFAULT_DOF_ID_ORG = "PE,PL,PJ,OA,EPEM,EF,OD,AV,CV,VG,TODOS";

/**
 * The two buyers README.md's "DOF is a CFE/PEMEX supplement" section
 * confirmed actually have real tender notices indexed in DOF (as opposed
 * to a buyer that might just never appear here at all) — offered as quick-
 * select presets in ImportDofSearchForm.tsx's "采购单位关键词" dropdown per
 * the user's explicit request (2026-09-04), plus a "自定义" escape hatch
 * for any other buyer, since the search itself isn't actually restricted
 * to just these two.
 */
export const DOF_BUYER_PRESETS = [
  { value: "Comisión Federal de Electricidad", label: "国家电力公司 CFE — Comisión Federal de Electricidad" },
  { value: "Petróleos Mexicanos", label: "国家石油公司 PEMEX — Petróleos Mexicanos" },
] as const;

export type ImportDofSearchLiveResult = {
  totalNotas: number;
  detailsFetched: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};
