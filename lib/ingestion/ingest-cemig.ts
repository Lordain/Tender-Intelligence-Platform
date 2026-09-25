/**
 * Cemig ingestion — the one path the daily cron and any admin button go
 * through, for the reason ingest-chile.ts gives: two callers with two copies
 * drift.
 *
 * Reads every published process (connectors/cemig-live.ts), keeps those
 * published within the window (publication-window.ts), classifies them with
 * lib/relevance-cemig.ts and upserts the kept ones. The edital zip link is
 * saved after the write.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCemigPublishedProcesses, type CemigProcess } from "@/lib/ingestion/connectors/cemig-live";
import { CEMIG_SOURCE_NAME, cemigDocumentLinks, mapCemigProcessToTender } from "@/lib/ingestion/cemig-mapper";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

export { CEMIG_SOURCE_NAME };

export type CemigIngestResult = {
  fetchedCount: number;
  mappedCount: number;
  days: number;
  recentCount: number;
  /** Tiers of the rows inside the window. */
  tierCounts: Record<TenderRelevanceTier, number>;
  staleWarning: string | null;
  kept: Tender[];
  write: boolean;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  skippedShortWindowCount?: number;
  skippedClosedCount?: number;
  failed?: { slug: string; error: string }[];
  documentLinks?: { tendersWithLinks: number; linkCount: number; failed: number };
};

/**
 * Cemig always has something published — 22 processes on 2026-09-25 — so
 * zero, or rows that no longer map, is the API changing, not a quiet day.
 */
export function describeCemigStaleness(fetchedCount: number, mappedCount: number): string | null {
  if (fetchedCount === 0) {
    return (
      "⚠ Cemig 一个已发布流程都没返回。\n" +
      "  这不等于 Cemig 今天没有招标 —— 2026-09-25 实测有 22 个。更可能是接口改了，先在浏览器打开 app2-compras.cemig.com.br/pesquisa 对照。"
    );
  }
  if (mappedCount === 0) {
    return `⚠ Cemig 返回了 ${fetchedCount} 个流程，但一个都没能映射成招标记录 —— 字段对不上了，见 cemig-mapper.ts。`;
  }
  return null;
}

export async function ingestCemig(
  supabase: SupabaseClient | null,
  options: { write: boolean; days?: number; processes?: CemigProcess[]; now?: Date },
  onProgress?: (message: string) => void,
): Promise<CemigIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const processes = options.processes ?? (await fetchCemigPublishedProcesses(onProgress));

  const processBySlug = new Map<string, CemigProcess>();
  const mapped: Tender[] = [];
  for (const process of processes) {
    const tender = mapCemigProcessToTender(process, now);
    if (!tender) continue;
    mapped.push(tender);
    processBySlug.set(tender.slug, process);
  }
  const recent = filterTendersPublishedWithinDays(mapped, days, now);

  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of recent) tierCounts[tender.relevance.tier] += 1;

  const result: CemigIngestResult = {
    fetchedCount: processes.length,
    mappedCount: mapped.length,
    days,
    recentCount: recent.length,
    tierCounts,
    staleWarning: describeCemigStaleness(processes.length, mapped.length),
    kept: recent.filter((tender) => tender.relevance.tier !== "excluded"),
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, skippedExcludedCount, skippedShortWindowCount, skippedClosedCount, failed } = await upsertTendersBatched(supabase, recent);
  const saved = await saveDocumentLinks(
    supabase,
    result.kept.map((tender) => ({ slug: tender.slug, links: cemigDocumentLinks(processBySlug.get(tender.slug)!, tender.publicationDate) })),
  );
  return {
    ...result,
    upsertedCount,
    skippedExcludedCount,
    skippedShortWindowCount,
    skippedClosedCount,
    failed,
    documentLinks: { tendersWithLinks: saved.tendersWithLinks, linkCount: saved.linkCount, failed: saved.failed.length },
  };
}
