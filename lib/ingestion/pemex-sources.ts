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

// Real full names for every subsidiary list — the first three were confirmed
// 2026-09-03 (see pemex-mapper.ts's own header comment and
// lib/ingestion/README.md); PE/PF/PPS added per the user's own real-world
// research (2026-09-04, matching PEMEX's actual current subsidiary
// structure: Etileno/Fertilizantes/Perforación y Servicios).
// "Concursos-e-invitaciones" isn't tied to one subsidiary at all (it's a
// separate, broader list) — "Pemex Concursos e Invitaciones" is the user's
// own placeholder label for it, not a real corporate entity name, same as
// every other value here being the buyer name submitted with each tender.
export const KNOWN_BUYER_NAMES: Partial<Record<PemexListTitle, string>> = {
  "Concursos-Abiertos-PEP": "Pemex Exploración y Producción",
  "Concursos-Abiertos-PTI": "Pemex Transformación Industrial",
  "Concursos-Abiertos-PL": "Pemex Logística",
  "Concursos-Abiertos-PE": "Pemex Etileno",
  "Concursos-Abiertos-PF": "Pemex Fertilizantes",
  "Concursos-Abiertos-PPS": "Pemex Perforación y Servicios",
  "Concursos-e-invitaciones": "Pemex Concursos e Invitaciones",
};


export type ImportPemexLiveResult = {
  listTitle: string;
  totalItems: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  /** Official bid-document links captured for the written tenders — feeds 批量下载标书 on /admin/documents-needed. Write runs only. */
  documentLinks?: { tenders: number; links: number; failedItems: number };
  sample: Tender[];
};
