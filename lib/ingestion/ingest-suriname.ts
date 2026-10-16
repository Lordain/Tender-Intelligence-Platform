/**
 * Suriname gov.sr 「Aanbestedingen」 ingestion, for the daily job
 * (scripts/cron-suriname.ts) and the 苏里南 tab's import button. Reads the
 * category (one request), reads each post (suriname-notice.ts), classifies
 * it with Suriname's rule (lib/relevance-suriname.ts — user, 2026-10-16: A)
 * and writes the kept calls still taking bids, with the notice PDF.
 *
 * A post whose deadline cannot be read is never written: whether it is
 * still open is the one fact a listing cannot do without, and the run lists
 * it for an admin to open instead.
 *
 * Suriname is a STAGED country (lib/staged-countries.ts): what this writes
 * is visible in the admin pages and nowhere public until the user opens it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { fetchSurinamePosts, type SurinamePost } from "@/lib/ingestion/connectors/suriname-govsr-live";
import { parseSurinamePost, type SurinameNotice } from "@/lib/ingestion/suriname-notice";
import { mapSurinameNoticeToTender, SURINAME_SOURCE_NAME } from "@/lib/ingestion/suriname-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { safeFileName, saveDocumentLinks, type TenderDocumentLink } from "@/lib/ingestion/document-links";

export { SURINAME_SOURCE_NAME };

export type SurinameRowOutcome = "write" | "excluded" | "closed" | "no_deadline";

export type SurinameRow = { notice: SurinameNotice; tender: Tender; outcome: SurinameRowOutcome };

export type SurinameIngestResult = {
  postCount: number;
  rows: SurinameRow[];
  kept: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};

export function surinameDocumentLinks(notice: SurinameNotice): TenderDocumentLink[] {
  return notice.documents.map((url) => ({
    sourceUrl: url,
    fileName: safeFileName(decodeURIComponent(url.split("/").pop() ?? "notice.pdf")),
    documentType: "Tender notice",
    format: "pdf",
    publishedAt: notice.publishedAt,
  }));
}

export function surinameOutcome(notice: SurinameNotice, tender: Tender, now: Date): SurinameRowOutcome {
  if (tender.relevance.tier === "excluded") return "excluded";
  if (!notice.deadline) return "no_deadline";
  return Date.parse(notice.deadline) < now.getTime() ? "closed" : "write";
}

export async function ingestSuriname(
  supabase: SupabaseClient | null,
  options: { write: boolean; posts?: SurinamePost[]; now?: Date },
): Promise<SurinameIngestResult> {
  const now = options.now ?? new Date();
  const posts = options.posts ?? (await fetchSurinamePosts());
  const rows: SurinameRow[] = posts.map((post) => {
    const notice = parseSurinamePost(post);
    const tender = mapSurinameNoticeToTender(notice, now);
    return { notice, tender, outcome: surinameOutcome(notice, tender, now) };
  });
  const toWrite = rows.filter((row) => row.outcome === "write");

  const result: SurinameIngestResult = {
    postCount: posts.length,
    rows,
    kept: toWrite.map((row) => row.tender),
    staleWarning:
      posts.length === 0 ? "⚠ gov.sr 招标栏目一条文章都没返回。2026-10-16 实测有 15 条，更可能是栏目编号或接口变了，见 suriname-govsr-live.ts。" : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  if (toWrite.length === 0) return { ...result, upsertedCount: 0, failed: [] };
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, result.kept);
  await saveDocumentLinks(
    supabase,
    toWrite.map((row) => ({ slug: row.tender.slug, links: surinameDocumentLinks(row.notice) })),
  );
  return { ...result, upsertedCount, failed };
}
