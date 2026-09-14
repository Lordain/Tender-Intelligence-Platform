import type { SupabaseClient } from "@supabase/supabase-js";
import { syncKeyDatesForTopLevelFields } from "@/lib/db/key-dates-sync";
import { deadlineFromOpening } from "@/lib/ingestion/mexico-opening-deadline";
import type { TenderKeyDate } from "@/types/tender";

/**
 * Gives Mexican tenders a bid deadline they already have, filed under
 * another name.
 *
 * The gap, reported 2026-09-14: with Peru's fichas pasted in by hand, the
 * admin list's 缺交标日期 filter came down to Mexico. Those rows are not
 * missing the date because nobody published it — LAASSP/LOPSRM schedule
 * handing the proposals in and opening them as ONE act, so the opening date
 * on the tender IS the deadline. See mexico-opening-deadline.ts for the rule
 * and for the case it refuses (an economic opening is the SECOND session,
 * days after bidding closed).
 *
 * Shared by the CLI (scripts/backfill-mexico-deadlines.ts) and the admin
 * button, the same way reclassify-tenders.ts is — one implementation, so a
 * preview in the browser and a dry run in a terminal can never disagree.
 *
 * Fills only what is empty. A deadline from the source, from a document or
 * from an admin always wins.
 */
export type BackfillKeyDate = {
  type: TenderKeyDate["type"];
  date: string;
  label: string;
  origin: "标书" | "人工" | "数据源";
};

export type BackfillCandidate = {
  slug: string;
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
  publicationDate: string | null;
  /** Files this platform actually holds (tender_documents). */
  documentCount: number;
  /** Official download URLs discovered at ingest (tender_document_links) — see migration 0042 for why the two are different questions. */
  documentLinkCount: number;
  keyDates: BackfillKeyDate[];
  /** Set when a deadline can be read off an opening. */
  fill?: { date: string; basis: string };
  /** Set instead when it cannot, with which of the two reasons. */
  blocked?: "no_opening" | "economic_only";
  /** Only in a --write run: what actually happened to this row. */
  outcome?: "written" | "failed";
  error?: string;
};

export type BackfillResult = {
  country: string;
  write: boolean;
  totalMissing: number;
  fillableCount: number;
  stuckCount: number;
  writtenCount: number;
  failedCount: number;
  candidates: BackfillCandidate[];
};

type TenderRow = {
  id: string;
  slug: string;
  title: { zh?: string; es?: string } | null;
  source_name: string | null;
  source_url: string | null;
  publication_date: string | null;
  award_date: string | null;
  manual_field_overrides: string[] | null;
};

type KeyDateRow = {
  tender_id: string;
  type: TenderKeyDate["type"];
  date: string;
  notes: { es?: string; en?: string; zh?: string } | null;
  extracted_from_document: boolean;
  manually_added: boolean;
};

/** Chunked because PostgREST puts the whole `in` list in the URL, and a few hundred ids overrun it. */
async function selectByTenderIds<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await run(ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

export async function backfillMexicoDeadlines(
  supabase: SupabaseClient,
  options: { write?: boolean; country?: string } = {},
): Promise<BackfillResult> {
  const write = options.write === true;
  const country = options.country ?? "Mexico";

  // The one-act premise is Mexican law; Peru and Colombia publish an opening
  // that genuinely follows the deadline, so filling one from the other there
  // would invent a date. Other countries can be inspected, never written.
  if (write && country !== "Mexico") {
    throw new Error(`写入仅对墨西哥开放：${country} 的开标通常在交标之后单独一天，套用同一条规则等于凭空捏造截止日。`);
  }

  const { data: tenderData, error: tenderError } = await supabase
    .from("tenders")
    .select("id, slug, title, source_name, source_url, publication_date, award_date, manual_field_overrides")
    .eq("country", country)
    .is("submission_deadline", null);
  if (tenderError) throw new Error(tenderError.message);
  const tenders = (tenderData ?? []) as TenderRow[];

  const result: BackfillResult = {
    country,
    write,
    totalMissing: tenders.length,
    fillableCount: 0,
    stuckCount: 0,
    writtenCount: 0,
    failedCount: 0,
    candidates: [],
  };
  if (tenders.length === 0) return result;

  const ids = tenders.map((tender) => tender.id);
  const keyDates = await selectByTenderIds<KeyDateRow>(ids, (chunk) =>
    supabase
      .from("tender_key_dates")
      .select("tender_id, type, date, notes, extracted_from_document, manually_added")
      .in("tender_id", chunk),
  );
  const documents = await selectByTenderIds<{ tender_id: string }>(ids, (chunk) =>
    supabase.from("tender_documents").select("tender_id").in("tender_id", chunk),
  );
  // Counted separately on purpose: "we hold the file" and "we know where to
  // download it" are different questions (migration 0042), and they lead to
  // completely different next steps — analyse what we have, versus click
  // 批量下载标书, versus re-run the import that discovers links at all.
  const documentLinks = await selectByTenderIds<{ tender_id: string }>(ids, (chunk) =>
    supabase.from("tender_document_links").select("tender_id").in("tender_id", chunk),
  );

  const byTender = new Map<string, KeyDateRow[]>();
  for (const row of keyDates) {
    const list = byTender.get(row.tender_id);
    if (list) list.push(row);
    else byTender.set(row.tender_id, [row]);
  }
  const documentCounts = new Map<string, number>();
  for (const row of documents) documentCounts.set(row.tender_id, (documentCounts.get(row.tender_id) ?? 0) + 1);
  const linkCounts = new Map<string, number>();
  for (const row of documentLinks) linkCounts.set(row.tender_id, (linkCounts.get(row.tender_id) ?? 0) + 1);

  for (const tender of tenders) {
    const rows = (byTender.get(tender.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const verdict = deadlineFromOpening(rows);

    const candidate: BackfillCandidate = {
      slug: tender.slug,
      title: tender.title?.zh ?? tender.title?.es ?? tender.slug,
      sourceName: tender.source_name,
      sourceUrl: tender.source_url,
      publicationDate: tender.publication_date,
      documentCount: documentCounts.get(tender.id) ?? 0,
      documentLinkCount: linkCounts.get(tender.id) ?? 0,
      keyDates: rows.map((row) => ({
        type: row.type,
        date: row.date,
        label: row.notes?.zh ?? "",
        origin: row.extracted_from_document ? "标书" : row.manually_added ? "人工" : "数据源",
      })),
    };

    if (verdict.ok) {
      candidate.fill = { date: verdict.date, basis: verdict.basis };
      result.fillableCount += 1;
    } else {
      candidate.blocked = verdict.reason;
      result.stuckCount += 1;
    }
    result.candidates.push(candidate);

    if (!write || !verdict.ok) continue;

    // Locked as a hand edit, same as the cronograma paste route — and for the
    // same reason it was added there (2026-09-15): a source that publishes no
    // deadline writes null straight over this on the next import, and the
    // mirror key date goes with it. A date derived from the opening act is
    // this platform's own reading, not the feed's, so the feed must not get
    // to erase it.
    const overrides = new Set<string>(tender.manual_field_overrides ?? []);
    overrides.add("submission_deadline");
    const { error } = await supabase
      .from("tenders")
      .update({ submission_deadline: verdict.date, manual_field_overrides: [...overrides].sort() })
      .eq("id", tender.id);
    if (error) {
      candidate.outcome = "failed";
      candidate.error = error.message;
      result.failedCount += 1;
      continue;
    }
    // All three, not just the one that changed: the sync clears the mirror
    // rows of every type it owns before rebuilding, so omitting a column that
    // has a value would delete its row and put nothing back.
    await syncKeyDatesForTopLevelFields(supabase, tender.id, {
      publicationDate: tender.publication_date,
      submissionDeadline: verdict.date,
      awardDate: tender.award_date,
    });
    candidate.outcome = "written";
    result.writtenCount += 1;
  }

  return result;
}
