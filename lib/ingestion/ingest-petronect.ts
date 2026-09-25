/**
 * Petronect ingestion — the one path the daily cron and any later admin
 * button go through, for the reason ingest-chile.ts gives: two callers with
 * two copies drift.
 *
 * Every run reads every open opportunity (one request, see
 * connectors/petronect-live.ts), classifies it with lib/relevance-petronect.ts
 * and upserts the kept ones. No recency window: the list only holds
 * opportunities still open for bids, so everything in it is current by
 * definition, and a window on publication date would drop the ones Petrobras
 * gives long bidding periods — which are the large ones (the 2026-05-11
 * clarifier contract closes 2026-10-09).
 *
 * Attachment links are saved after the write, from the same response: the
 * list already carries each opportunity's attachment ids, so they cost no
 * extra request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPetronectOpenOpportunities, type PetronectOpportunity } from "@/lib/ingestion/connectors/petronect-live";
import { mapPetronectOpportunityToTender, petronectDocumentLinks, PETRONECT_SOURCE_NAME } from "@/lib/ingestion/petronect-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks, type DocumentLinksForSlug } from "@/lib/ingestion/document-links";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

export { PETRONECT_SOURCE_NAME };

export type PetronectIngestResult = {
  fetchedCount: number;
  mappedCount: number;
  internationalCount: number;
  tierCounts: Record<TenderRelevanceTier, number>;
  /** Non-null when the answer cannot be a normal day — see describePetronectStaleness. */
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
 * Whether an answer is news rather than a quiet day.
 *
 * Petrobras never has nothing open — 309 opportunities on 2026-09-25, with
 * roughly six new ones a day through September. Zero rows, or rows that no
 * longer map, means the portal or its shape changed, and that must not be
 * reported as a clean run that found nothing.
 */
export function describePetronectStaleness(fetchedCount: number, mappedCount: number): string | null {
  if (fetchedCount === 0) {
    return (
      "⚠ Petronect 一条在招项目都没返回。\n" +
      "  这不等于 Petrobras 今天没有招标 —— 2026-09-25 实测有 309 个在招项目。\n" +
      "  更可能是接口改了或被拒，先在浏览器打开 Petronect 的「Lista de Oportunidades Abertas」页面对照。"
    );
  }
  if (mappedCount === 0) {
    return (
      `⚠ Petronect 返回了 ${fetchedCount} 条，但一条都没能映射成招标记录。\n` +
      "  说明网络和接口都通，是字段对不上了（OPPORT_NUM / DESC_OBJ_CONTRAT / START_DATE），见 petronect-mapper.ts。"
    );
  }
  return null;
}

export async function ingestPetronect(
  supabase: SupabaseClient | null,
  options: { write: boolean; rows?: PetronectOpportunity[] },
  onProgress?: (message: string) => void,
): Promise<PetronectIngestResult> {
  const rows = options.rows ?? (await fetchPetronectOpenOpportunities());
  onProgress?.(`Petronect 在招项目 ${rows.length} 个`);

  const rowBySlug = new Map<string, PetronectOpportunity>();
  const mapped: Tender[] = [];
  for (const row of rows) {
    const tender = mapPetronectOpportunityToTender(row);
    if (!tender) continue;
    mapped.push(tender);
    rowBySlug.set(tender.slug, row);
  }

  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of mapped) tierCounts[tender.relevance.tier] += 1;

  const result: PetronectIngestResult = {
    fetchedCount: rows.length,
    mappedCount: mapped.length,
    internationalCount: rows.filter((row) => row.NAT_COVERAGE === "I").length,
    tierCounts,
    staleWarning: describePetronectStaleness(rows.length, mapped.length),
    kept: mapped.filter((tender) => tender.relevance.tier !== "excluded"),
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, skippedExcludedCount, skippedShortWindowCount, skippedClosedCount, failed } = await upsertTendersBatched(supabase, mapped);

  // After the write: a link row needs the tender's id, which saveDocumentLinks
  // resolves by slug. Slugs that were not written (excluded, past deadline,
  // short bidding window, deleted by hand) simply resolve to nothing.
  const entries: DocumentLinksForSlug[] = result.kept.map((tender) => ({
    slug: tender.slug,
    links: petronectDocumentLinks(rowBySlug.get(tender.slug)!, tender.publicationDate),
  }));
  const saved = await saveDocumentLinks(supabase, entries);

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
