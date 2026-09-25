/**
 * UPME transmission-call ingestion, shared by the daily cron and any later
 * admin button (see ingest-chile.ts for why the split exists).
 *
 * Reads every call UPME still tags open or pre-published (one request; see
 * connectors/upme-live.ts), keeps the ones whose investor selection has not
 * started, and upserts them with their documents as links.
 *
 * Zero calls tagged open is reported, because UPME always has some — sixteen
 * on 2026-09-25. Zero calls still BIDDABLE is not: a quarter with no open
 * call is normal, and most tagged calls are further along than their tag.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUpmeCalls, parseUpmePost, type UpmeCall, type UpmePost } from "@/lib/ingestion/connectors/upme-live";
import { mapUpmeCallToTender, upmeDocumentLinks, upmeSkipReason, UPME_SOURCE_NAME } from "@/lib/ingestion/upme-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

export { UPME_SOURCE_NAME };

export type UpmeIngestResult = {
  taggedCount: number;
  calls: { call: UpmeCall; skipReason: string | null }[];
  days: number;
  /** Still-biddable calls published within `days` — the ones written. */
  kept: Tender[];
  /** Still biddable, but published before the window. */
  biddableCount: number;
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  linkCount?: number;
};

export async function ingestUpme(
  supabase: SupabaseClient | null,
  options: { write: boolean; days?: number; posts?: UpmePost[]; now?: Date },
): Promise<UpmeIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const posts = options.posts ?? (await fetchUpmeCalls());
  const calls = posts.map(parseUpmePost).filter((call): call is UpmeCall => call !== null);

  const biddable: Tender[] = [];
  const callBySlug = new Map<string, UpmeCall>();
  for (const call of calls) {
    const tender = mapUpmeCallToTender(call, now);
    if (!tender) continue;
    biddable.push(tender);
    callBySlug.set(tender.slug, call);
  }
  // The user's 3-day window (publication-window.ts). A call's date moves from
  // its pre-publication to its official publication, so a pre-published call
  // gets a second window the day UPME opens it officially.
  const kept = filterTendersPublishedWithinDays(biddable, days, now);
  const keptSlugs = new Set(kept.map((tender) => tender.slug));

  const result: UpmeIngestResult = {
    taggedCount: posts.length,
    calls: calls.map((call) => {
      const skipReason = upmeSkipReason(call, now);
      if (skipReason) return { call, skipReason };
      const slug = biddable.find((tender) => callBySlug.get(tender.slug) === call)?.slug;
      return { call, skipReason: slug && !keptSlugs.has(slug) ? `发布超过 ${days} 天` : null };
    }),
    days,
    kept,
    biddableCount: biddable.length,
    staleWarning:
      posts.length === 0
        ? "⚠ UPME 一条「开放 / 预公告」的输电项目都没返回。2026-09-25 实测有 16 条，更可能是接口或分类编号变了（estado_convocatoria 283/287）。"
        : calls.length === 0
          ? `⚠ UPME 返回了 ${posts.length} 条，但一条都没解析出项目编号（UPME NN-YYYY），见 upme-live.ts。`
          : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, kept);
  const saved = await saveDocumentLinks(
    supabase,
    kept.map((tender) => ({ slug: tender.slug, links: upmeDocumentLinks(callBySlug.get(tender.slug)!, tender.publicationDate) })),
  );
  return { ...result, upsertedCount, failed, linkCount: saved.linkCount };
}
