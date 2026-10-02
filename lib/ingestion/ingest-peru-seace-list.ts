import type { SupabaseClient } from "@supabase/supabase-js";
import { isLateRestart, mapSeaceListRowToTender, readSeaceListFile } from "@/lib/ingestion/peru-seace-list";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

/**
 * The admin 秘鲁 tab's 「SEACE 导出清单」 upload and `npm run
 * ingest:peru-seace-list` — one path for both, like every other source here.
 * See lib/ingestion/peru-seace-list.ts for the file and why it exists.
 *
 * No day window: the export already IS the window the admin searched for on
 * SEACE. What it does filter, before the usual relevance rules:
 *   - restarts from the evaluation stage or later (isLateRestart) — not a new
 *     opportunity;
 *   - procedures already in the database under ANY Peru slug, matched on the
 *     tender number — the OECE import's row has the document links and the
 *     enquiry window this file lacks, so it is never overwritten from here,
 *     and the admin's own edits stay put (库里的不动);
 *   - procedures an admin deleted, matched the same way.
 */
export type SeaceListImportResult = {
  totalRows: number;
  lateRestartCount: number;
  mappedCount: number;
  alreadyInDatabaseCount: number;
  previouslyDeletedCount: number;
  /** Rows that went through classification: new to the database. */
  keptCount: number;
  tierCounts: Record<TenderRelevanceTier, number>;
  /** Every non-excluded new row, biggest first — the admin reads all of them, there are seldom more than a few dozen. */
  surfaced: Pick<Tender, "slug" | "tenderNumber" | "title" | "buyer" | "estimatedValue" | "currency" | "procedureType" | "industries" | "relevance" | "publicationDate">[];
  write: boolean;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  /** Only with options.preview: every kept row, for the CLI's classification report. */
  preview?: Tender[];
};

const LOOKUP_CHUNK = 100;

/** Tender numbers already known for Peru: number → slug, from live rows and from admin deletions. */
async function knownPeruNumbers(
  supabase: SupabaseClient,
  numbers: string[],
  slugPrefix: string,
): Promise<{ live: Map<string, string>; deleted: Map<string, string> }> {
  const live = new Map<string, string>();
  const deleted = new Map<string, string>();
  for (let i = 0; i < numbers.length; i += LOOKUP_CHUNK) {
    const chunk = numbers.slice(i, i + LOOKUP_CHUNK);
    const [rows, deletions] = await Promise.all([
      supabase.from("tenders").select("slug, tender_number").eq("country", "Peru").like("slug", `${slugPrefix}%`).in("tender_number", chunk),
      supabase.from("tender_manual_deletions").select("slug, tender_number").like("slug", `${slugPrefix}%`).in("tender_number", chunk),
    ]);
    if (rows.error) throw new Error(`无法查询已有的秘鲁项目：${rows.error.message}`);
    // Same stance as upsert-tenders.ts: an unreadable deletion list stops the
    // import rather than quietly re-inserting what an admin removed.
    if (deletions.error && deletions.error.code !== "42P01") throw new Error(`无法读取 tender_manual_deletions：${deletions.error.message}`);
    for (const row of rows.data ?? []) live.set(row.tender_number as string, row.slug as string);
    for (const row of deletions.data ?? []) deleted.set(row.tender_number as string, row.slug as string);
  }
  return { live, deleted };
}

/**
 * The other direction, for the OECE import (ingest-peru.ts): a procedure first
 * loaded from a SEACE export lives under `peru-seace-…`, and once the API
 * catches up the same procedure arrives under its ocid slug. Rewriting the
 * OECE row onto the existing slug makes that an UPDATE — the row gains its
 * document links and enquiry dates — instead of a second copy. A deleted
 * `peru-seace-…` row lends its slug too, so upsert-tenders.ts skips it as
 * deleted rather than the OECE copy bringing it back.
 */
export async function adoptSeaceListSlugs(supabase: SupabaseClient, tenders: Tender[]): Promise<{ tenders: Tender[]; adopted: number }> {
  const numbers = [...new Set(tenders.map((tender) => tender.tenderNumber))];
  const { live, deleted } = await knownPeruNumbers(supabase, numbers, "peru-seace-");
  let adopted = 0;
  const result = tenders.map((tender) => {
    const slug = live.get(tender.tenderNumber) ?? deleted.get(tender.tenderNumber);
    if (!slug || slug === tender.slug) return tender;
    adopted += 1;
    return { ...tender, slug, keyDates: tender.keyDates.map((date) => ({ ...date, id: date.id.replace(tender.slug, slug) })) };
  });
  return { tenders: result, adopted };
}

export async function importPeruSeaceList(
  supabase: SupabaseClient | null,
  buffer: Buffer,
  options: { write: boolean; preview?: boolean },
): Promise<SeaceListImportResult> {
  const rows = readSeaceListFile(buffer);
  const current = rows.filter((row) => !isLateRestart(row));
  const mapped = current.map(mapSeaceListRowToTender).filter((tender): tender is Tender => tender !== null);

  let kept = mapped;
  let alreadyInDatabaseCount = 0;
  let previouslyDeletedCount = 0;
  if (supabase) {
    const { live, deleted } = await knownPeruNumbers(supabase, [...new Set(mapped.map((tender) => tender.tenderNumber))], "peru-");
    kept = mapped.filter((tender) => {
      if (live.has(tender.tenderNumber)) {
        alreadyInDatabaseCount += 1;
        return false;
      }
      if (deleted.has(tender.tenderNumber)) {
        previouslyDeletedCount += 1;
        return false;
      }
      return true;
    });
  }

  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of kept) tierCounts[tender.relevance.tier] += 1;
  const tierRank: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 1, standard: 2, excluded: 3 };
  const surfaced = kept
    .filter((tender) => tender.relevance.tier !== "excluded")
    .sort((a, b) => tierRank[a.relevance.tier] - tierRank[b.relevance.tier] || (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
    .map(({ slug, tenderNumber, title, buyer, estimatedValue, currency, procedureType, industries, relevance, publicationDate }) => ({
      slug,
      tenderNumber,
      title,
      buyer,
      estimatedValue,
      currency,
      procedureType,
      industries,
      relevance,
      publicationDate,
    }));

  const result: SeaceListImportResult = {
    totalRows: rows.length,
    lateRestartCount: rows.length - current.length,
    mappedCount: mapped.length,
    alreadyInDatabaseCount,
    previouslyDeletedCount,
    keptCount: kept.length,
    tierCounts,
    surfaced,
    write: options.write,
    ...(options.preview ? { preview: kept } : {}),
  };
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");

  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
