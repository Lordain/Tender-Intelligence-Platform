/**
 * Petroperú international-competition ingestion, shared by the daily cron and
 * any later admin button.
 *
 * One page read (connectors/petroperu-live.ts), then one documents request
 * per PCI row inside the window — usually none: two PCI calls in a year.
 *
 * The window is five days, not the three of the other company sources: the
 * user's own call for this source (2026-09-25: 只导入发布 5 天以内的).
 *
 * An empty list is reported — the page keeps years of rows. No PCI in the
 * window is normal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPetroperuDocuments, fetchPetroperuList, type PetroperuCall, type PetroperuRow } from "@/lib/ingestion/connectors/petroperu-live";
import {
  isPetroperuCall,
  mapPetroperuCallToTender,
  petroperuClosingDocument,
  petroperuDocumentLinks,
  PETROPERU_SOURCE_NAME,
} from "@/lib/ingestion/petroperu-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

export { PETROPERU_SOURCE_NAME };

export const PETROPERU_WINDOW_DAYS = 5;

export type PetroperuIngestResult = {
  listedCount: number;
  /** PCI rows on the page, any date. */
  pciCount: number;
  days: number;
  /** Every PCI row read in the window, with why it was not imported. */
  calls: { call: PetroperuCall; skipReason: string | null }[];
  /** Mapped, in the window, not excluded — the ones written. */
  kept: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  linkCount?: number;
};

/** A row published on or after this day could be inside the window; its exact time is checked after mapping. */
function earliestDay(days: number, now: Date): string {
  return new Date(now.getTime() - (days + 1) * 86_400_000).toISOString().slice(0, 10);
}

export async function ingestPetroperu(
  supabase: SupabaseClient | null,
  options: {
    write: boolean;
    days?: number;
    rows?: PetroperuRow[];
    /** Documents by row id, for the fixture; the live read fetches them. */
    documents?: Record<string, PetroperuCall["documents"]>;
    now?: Date;
  },
): Promise<PetroperuIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? PETROPERU_WINDOW_DAYS;
  const rows = options.rows ?? (await fetchPetroperuList());
  const pci = rows.filter(isPetroperuCall);
  const candidates = days > 0 ? pci.filter((row) => row.publishedOn >= earliestDay(days, now)) : pci;

  const calls: PetroperuIngestResult["calls"] = [];
  const mapped: Tender[] = [];
  const callBySlug = new Map<string, PetroperuCall>();
  for (const row of candidates) {
    const documents = options.documents ? (options.documents[row.id] ?? []) : await fetchPetroperuDocuments(row.id);
    const call: PetroperuCall = { ...row, documents };
    const tender = mapPetroperuCallToTender(call, now);
    if (!tender) {
      calls.push({ call, skipReason: `已结束（最新文件：${petroperuClosingDocument(call) ?? "—"}）` });
      continue;
    }
    if (filterTendersPublishedWithinDays([tender], days, now).length === 0) {
      calls.push({ call, skipReason: `发布超过 ${days} 天` });
      continue;
    }
    calls.push({ call, skipReason: tender.relevance.tier === "excluded" ? "筛选规则排除（服务/咨询类）" : null });
    mapped.push(tender);
    callBySlug.set(tender.slug, call);
  }

  const result: PetroperuIngestResult = {
    listedCount: rows.length,
    pciCount: pci.length,
    days,
    calls,
    kept: mapped.filter((tender) => tender.relevance.tier !== "excluded"),
    staleWarning:
      rows.length === 0
        ? "⚠ Petroperú「Competencia internacional」列表一行都没解析出来。2026-09-25 实测第一页有 20 行，更可能是页面结构变了，见 petroperu-live.ts。"
        : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, mapped);
  const saved = await saveDocumentLinks(
    supabase,
    result.kept.map((tender) => ({ slug: tender.slug, links: petroperuDocumentLinks(callBySlug.get(tender.slug)!, tender.publicationDate) })),
  );
  return { ...result, upsertedCount, failed, linkCount: saved.linkCount };
}
