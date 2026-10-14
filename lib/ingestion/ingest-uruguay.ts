/**
 * Uruguay ingestion — ARCE's OCDS feed, for the daily job
 * (scripts/cron-uruguay.ts). Added 2026-10-13, staged, and opened to
 * visitors 2026-10-14 (user: 前台+后台开放乌拉圭).
 *
 * Reads every new call published in the window, keeps the public tenders and
 * the key buyers' abbreviated tenders (isIngestedArceTender) that are still
 * taking bids, classifies them by the platform's general rules and writes
 * only what those keep, with each kept tender's pliego as a document link.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { fetchArceAward, fetchArceCancellations, fetchArceRelease, fetchArceTenders, isIngestedArceTender, type ArceRelease } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { listUnfinishedTenders, refreshStoredStatuses, type ObservedStatus, type StatusRefreshResult } from "@/lib/ingestion/status-refresh";
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

/** The purchase id an ARCE row was stored under (slug uruguay-{id}). */
export function uruguayPurchaseId(slug: string): string | null {
  return /^uruguay-(\d+)$/.exec(slug)?.[1] ?? null;
}

/**
 * Today's state of every stored Uruguayan call not yet finished (user,
 * 2026-10-13: 先做多米尼加、乌拉圭、巴拿马). An award is its own release,
 * adjudicacion-{id}, asked for directly; a cancellation or a call declared
 * void is found in the monthly feeds since the oldest stored call was
 * published, and its release says which (cancelled / unsuccessful).
 */
export async function refreshUruguayStatuses(
  supabase: SupabaseClient,
  options: { write: boolean; now?: Date },
  onProgress?: (message: string) => void,
): Promise<StatusRefreshResult & { checked: number; unreachable: string[] }> {
  const now = options.now ?? new Date();
  const stored = (await listUnfinishedTenders(supabase, [URUGUAY_SOURCE_NAME])).filter((row) => uruguayPurchaseId(row.slug));
  const observed: ObservedStatus[] = [];
  const unreachable: string[] = [];
  if (stored.length === 0) return { ...(await refreshStoredStatuses(supabase, [], { write: options.write, now })), checked: 0, unreachable };

  const oldest = stored.reduce((min, row) => (row.publication_date && row.publication_date < min ? row.publication_date : min), now.toISOString());
  // Six months at most: a call still unfinished after that is the source's to close, and each month is a 5 MB feed.
  const from = new Date(Math.max(Date.parse(oldest), now.getTime() - 183 * 86_400_000));
  const endings = await fetchArceCancellations(from, now);

  for (const [index, row] of stored.entries()) {
    const purchaseId = uruguayPurchaseId(row.slug)!;
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const ending = endings.get(purchaseId);
      if (ending) {
        const release = await fetchArceRelease(ending);
        const status = release?.tender?.status;
        if (status === "cancelled") observed.push({ slug: row.slug, status: "cancelled" });
        else if (status === "unsuccessful") observed.push({ slug: row.slug, status: "deserted" });
        continue;
      }
      const award = await fetchArceAward(purchaseId);
      if (award?.awards?.some((entry) => (entry.status ?? "active") === "active")) observed.push({ slug: row.slug, status: "awarded" });
    } catch (error) {
      unreachable.push(`${row.tender_number}：${error instanceof Error ? error.message : String(error)}`);
      if (unreachable.length >= 5 && observed.length === 0) break;
    }
    if ((index + 1) % 20 === 0) onProgress?.(`已查询 ${index + 1}/${stored.length}`);
  }
  const result = await refreshStoredStatuses(supabase, observed, { write: options.write, now });
  return { ...result, checked: stored.length, unreachable };
}
