/**
 * Client-safe types/constants for the "PEMEX 直接拉取" admin section
 * (ImportPemexForm.tsx) — split out of import-pemex-live.ts the same way
 * new-tenders-sources.ts was split out of import-new-tenders.ts, to keep
 * a "use client" component from transitively importing server-only code
 * (createSupabaseAdminClient, upsert-tenders.ts) into the browser bundle.
 */
import type { Tender } from "@/types/tender";

export const PEMEX_LIST_TITLES = [
  "Concursos-Abiertos-PEP",
  "Concursos-Abiertos-PTI",
  "Concursos-Abiertos-PL",
  "Concursos-Abiertos-PE",
  "Concursos-Abiertos-PF",
  "Concursos-Abiertos-PPS",
  "Concursos-e-invitaciones",
] as const;

export type PemexListTitle = (typeof PEMEX_LIST_TITLES)[number];

export type ImportPemexLiveResult = {
  listTitle: string;
  totalItems: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};
