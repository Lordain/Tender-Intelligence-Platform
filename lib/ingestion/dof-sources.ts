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
