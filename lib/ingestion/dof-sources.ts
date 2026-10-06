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
 *
 * CFE is two searches since 2026-10-06: some CFE units publish under their
 * own name — "CFE DISTRIBUCION GOLFO NORTE - REF:580519" — which a search for
 * the full name never returns (11 of 104 CFE calls, 2026-09-01 to 10-06).
 * The bare "CFE" search is kept to titles whose buyer starts with CFE
 * (`cfeOnly`), so a notice that merely mentions CFE is not taken for one.
 */
export const DOF_CFE_TERMS = ["Comisión Federal de Electricidad", "CFE"] as const;

export const DOF_BUYER_PRESETS = [
  { value: "cfe", label: "国家电力公司 CFE — 全称和以 CFE 开头的下属单位", terms: [...DOF_CFE_TERMS], cfeOnly: true },
  { value: "pemex", label: "国家石油公司 PEMEX — Petróleos Mexicanos", terms: ["Petróleos Mexicanos"], cfeOnly: false },
] as const;

export type ImportDofSearchLiveResult = {
  totalNotas: number;
  /** Calls already imported from CFE's micrositio by paste — the pasted copy is kept, the DOF one not written. */
  skippedPastedCount?: number;
  detailsFetched: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};
