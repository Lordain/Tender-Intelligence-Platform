/**
 * Uruguay ingestion — ARCE's OCDS feed, for the daily job
 * (scripts/cron-uruguay.ts). Added 2026-10-13, staged.
 *
 * Reads every new call published in the window, keeps the public tenders and
 * the key buyers' abbreviated tenders (isIngestedArceTender) that are still
 * taking bids, classifies them by the platform's general rules and writes
 * only what those keep, with each kept tender's pliego as a document link.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { fetchArceTenders, isIngestedArceTender, type ArceRelease } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { mapArceReleaseToTender, URUGUAY_SOURCE_NAME, uruguayDocumentLinks } from "@/lib/ingestion/uruguay-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";

export { URUGUAY_SOURCE_NAME };

export type UruguayIngestResult = {
  /** New calls ("tender" releases) in the window, every procedure. */
  listedCount: number;
  /** Calls whose release could not be read. */
  failedReads: string[];
  /** Calls by procedure, before the filter, commonest first. */
  byProcedure: [string, number][];
  rows: { release: ArceRelease; tender: Tender }[];
  kept: Tender[];
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  documentLinks?: number;
};

export async function ingestUruguay(
  supabase: SupabaseClient | null,
  options: {
    write: boolean;
    /** Publication window, days back from today. The daily job uses the shared 3-day window. */
    days?: number;
    now?: Date;
    fetchTenders?: (from: Date, to: Date) => Promise<{ listed: number; releases: ArceRelease[]; failed: string[] }>;
  },
): Promise<UruguayIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const { listed, releases, failed: failedReads } = await (options.fetchTenders ?? fetchArceTenders)(from, now);

  const procedures = new Map<string, number>();
  for (const release of releases) {
    const key = release.tender?.procurementMethodDetails ?? "(sin procedimiento)";
    procedures.set(key, (procedures.get(key) ?? 0) + 1);
  }
  const rows = releases.filter(isIngestedArceTender).map((release) => ({ release, tender: mapArceReleaseToTender(release, now) }));
  // Still taking bids, and kept by the rules.
  const kept = rows.filter((row) => row.tender.status === "open" && row.tender.relevance.tier !== "excluded").map((row) => row.tender);

  const result: UruguayIngestResult = {
    listedCount: listed,
    failedReads,
    byProcedure: [...procedures].sort((a, b) => b[1] - a[1]),
    rows,
    kept,
    write: options.write,
  };
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");

  const { upsertedCount, failed } = await upsertTendersBatched(supabase, kept);
  const keptSlugs = new Set(kept.map((tender) => tender.slug));
  const links = rows
    .filter((row) => keptSlugs.has(row.tender.slug))
    .map((row) => ({ slug: row.tender.slug, links: uruguayDocumentLinks(row.release) }))
    .filter((entry) => entry.links.length > 0);
  const saved = links.length > 0 ? await saveDocumentLinks(supabase, links) : null;
  return { ...result, upsertedCount, failed, documentLinks: saved?.linkCount ?? 0 };
}
