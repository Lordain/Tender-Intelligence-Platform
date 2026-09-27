/**
 * Guyana eprocure.gov.gy ingestion, for the daily cron. Reads every open
 * opportunity, reads each one's notice PDF for the two facts the row lacks
 * (international or national bidding, and who finances it), and writes only
 * the large ones — lib/relevance-guyana.ts. Small ones are never written: the
 * user does not want them (2026-09-27: 小项目不要).
 *
 * Guyana is a STAGED country (lib/staged-countries.ts): what this writes is
 * visible in the admin pages and nowhere public until the user opens it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGuyanaOpportunities, fetchNoticeText, type GuyanaOpportunity } from "@/lib/ingestion/connectors/guyana-eprocure-live";
import { guyanaDocumentLinks, guyanaTitle, mapGuyanaOpportunityToTender, GUYANA_SOURCE_NAME } from "@/lib/ingestion/guyana-mapper";
import { readGuyanaNotice, type GuyanaNoticeFacts } from "@/lib/relevance-guyana";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { runPool } from "@/lib/ingestion/run-pool";
import type { Tender } from "@/types/tender";

export { GUYANA_SOURCE_NAME };

export type GuyanaRow = { opportunity: GuyanaOpportunity; facts: GuyanaNoticeFacts; factsFrom: "notice" | "sibling" | "none"; tender: Tender };

export type GuyanaIngestResult = {
  listedCount: number;
  /** Notices whose text could be read. */
  readNoticeCount: number;
  rows: GuyanaRow[];
  kept: Tender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};

/** Agency + the title's first six words: the lots of one programme share it ("Supply and Installation of Transmission Mains at …"). */
function siblingKey(opportunity: GuyanaOpportunity): string {
  return `${opportunity.agency}|${guyanaTitle(opportunity.projectName).toLowerCase().split(/\s+/).slice(0, 6).join(" ")}`;
}

/**
 * Facts for every row. A notice with no text layer (a scan) borrows them from
 * a sibling lot of the same programme advertised by the same agency — on
 * 2026-09-27 the Bath lot of the CDB water programme was a scan and its four
 * sibling lots were not.
 */
export function resolveGuyanaFacts(
  opportunities: GuyanaOpportunity[],
  noticeTextById: Map<string, string | null>,
): Map<string, { facts: GuyanaNoticeFacts; factsFrom: GuyanaRow["factsFrom"] }> {
  const own = new Map(opportunities.map((opportunity) => [opportunity.projectId, readGuyanaNotice(noticeTextById.get(opportunity.projectId) ?? null)]));
  const bySibling = new Map<string, GuyanaNoticeFacts>();
  for (const opportunity of opportunities) {
    const facts = own.get(opportunity.projectId)!;
    if (facts.competition && !bySibling.has(siblingKey(opportunity))) bySibling.set(siblingKey(opportunity), facts);
  }
  const resolved = new Map<string, { facts: GuyanaNoticeFacts; factsFrom: GuyanaRow["factsFrom"] }>();
  for (const opportunity of opportunities) {
    const facts = own.get(opportunity.projectId)!;
    const sibling = facts.competition ? undefined : bySibling.get(siblingKey(opportunity));
    resolved.set(
      opportunity.projectId,
      facts.competition ? { facts, factsFrom: "notice" } : sibling ? { facts: sibling, factsFrom: "sibling" } : { facts, factsFrom: "none" },
    );
  }
  return resolved;
}

export async function ingestGuyana(
  supabase: SupabaseClient | null,
  options: { write: boolean; opportunities?: GuyanaOpportunity[]; noticeText?: (url: string) => Promise<string | null>; now?: Date },
): Promise<GuyanaIngestResult> {
  const now = options.now ?? new Date();
  const opportunities = options.opportunities ?? (await fetchGuyanaOpportunities());
  const readNotice = options.noticeText ?? fetchNoticeText;

  // Every notice of a row, joined — a row can carry an advertisement and an addendum.
  const noticeTextById = new Map<string, string | null>();
  await runPool(opportunities, 4, async (opportunity) => {
    const texts = [];
    for (const doc of opportunity.documents.slice(0, 3)) texts.push(await readNotice(doc.url));
    const joined = texts.filter(Boolean).join(" ");
    noticeTextById.set(opportunity.projectId, joined || null);
  });

  const factsById = resolveGuyanaFacts(opportunities, noticeTextById);
  const rows: GuyanaRow[] = opportunities.map((opportunity) => {
    const { facts, factsFrom } = factsById.get(opportunity.projectId)!;
    return { opportunity, facts, factsFrom, tender: mapGuyanaOpportunityToTender(opportunity, facts, now) };
  });
  const kept = rows.filter((row) => row.tender.relevance?.tier !== "excluded").map((row) => row.tender);
  const readNoticeCount = [...noticeTextById.values()].filter(Boolean).length;

  const result: GuyanaIngestResult = {
    listedCount: opportunities.length,
    readNoticeCount,
    rows,
    kept,
    staleWarning:
      opportunities.length === 0
        ? "⚠ eprocure.gov.gy 一条在招项目都没返回。2026-09-27 实测有 35 条，更可能是接口变了，见 guyana-eprocure-live.ts。"
        : readNoticeCount === 0
          ? "⚠ 一份招标公告都没读出文字 —— 多半是公告下载失败（eprocure.gov.gy 的 /files/ 链接），所有项目都会被当作小项目排除。"
          : null,
    write: options.write,
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, kept);
  const keptSlugs = new Set(kept.map((tender) => tender.slug));
  await saveDocumentLinks(
    supabase,
    rows.filter((row) => keptSlugs.has(row.tender.slug)).map((row) => ({ slug: row.tender.slug, links: guyanaDocumentLinks(row.opportunity) })),
  );
  return { ...result, upsertedCount, failed };
}
