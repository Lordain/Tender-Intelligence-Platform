import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSecopProcesos, fetchSecopProcesosByReference } from "@/lib/ingestion/connectors/colombia-secop-live";
import { fetchSecopDocumentsForProcess, fetchSecopDocumentsSample, downloadSecopDocument, isPreAwardDocument } from "@/lib/ingestion/connectors/colombia-documents-connector";
import { mapSecopRowToTender, extractNoticeUidFromUrl, type SecopProcesoRow } from "@/lib/ingestion/colombia-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { filterRecentTenders, filterTendersPublishedWithinDays, isPastSubmissionDeadline } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";

export type IngestColombiaOptions = {
  months: number;
  /**
   * Rolling window in days. Decides BOTH how far back the SECOP query
   * reaches and what survives the recency filter — `months` is ignored when
   * this is set. 0/undefined = use `months`.
   *
   * Same knob `ingest-peru.ts` already carries, and added here for the same
   * reason (2026-09-15, user: 我只想拉最近5天): once a country's rules are
   * settled, a re-import should bring in only what is genuinely new, because
   * the expensive part of an import is not the fetch — it is a human reading
   * several hundred fresh rows.
   *
   * Deliberately not expressed as a fraction of `months`: that arithmetic
   * runs through setMonth(), which clamps day-of-month (31 March minus one
   * month is 3 March, not 28 February), and a day count has no business
   * inheriting that.
   */
  days?: number;
  maxPages: number;
  write: boolean;
  /** Also downloads pre-award bid documents for every tender actually written this run — see the "documents" fields below. Ignored when write is false (there'd be no tender_id to attach a document to). */
  fetchDocuments: boolean;
};

export type IngestColombiaResult = {
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  protectedCount?: number;
  skippedManuallyDeletedCount?: number;
  failed?: { slug: string; error: string }[];
  documentsCandidateTenders?: number;
  documentsDownloaded?: number;
  documentsAlreadyOnFile?: number;
  documentsFailed?: number;
  /** Raw row count returned by the archivos-metadata API across all candidates, BEFORE the pre-award filter or per-file dedup/download. 0 here (with documentsFailed also 0) means the metadata dataset itself returned no rows for these tenders' `id_del_proceso` values — a coverage/id-matching question, not a download failure. See the comment on the fetch loop below. */
  documentsMetadataRowsFound?: number;
  /** Of documentsMetadataRowsFound, how many were skipped as post-award (already carried a contract number) rather than actually attempted for download. */
  documentsSkippedPostAward?: number;
  /** How many candidates got a metadata match via the noticeUID parsed from their own sourceUrl vs. the older id_del_proceso fallback — see extractNoticeUidFromUrl's header comment (2026-09-04 finding). */
  documentsFoundViaNoticeUid?: number;
  documentsFoundViaIdDelProceso?: number;
  /** Matched via id_del_portafolio (CO1.BDOS.*) — the id dmgg-8hin actually files documents under (2026-09-25). */
  documentsFoundViaPortfolio?: number;
  /**
   * Dry-run only (write: false). What a real run WOULD do, computed by
   * applying upsertTendersBatched's own two gates — both pure functions over
   * a Tender — rather than estimating from `keptAfterRecencyCount`, which
   * counts rows that merely mapped. Excludes the manual-deletion tombstone
   * check, which needs the database, so the real count is this or slightly
   * lower, never higher.
   */
  dryRunWouldWriteCount?: number;
  dryRunExcludedCount?: number;
  dryRunClosedCount?: number;
  /** Excluded rows grouped by the reason text, so a dry run says WHY, not just how many. */
  dryRunExcludedReasons?: Record<string, number>;
  /** The would-be-written rows by relevance tier. */
  dryRunTierCounts?: Record<string, number>;
};

const DOCUMENTS_PAGE_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * How far back this run reaches, and which recency filter the mapped rows
 * then go through. Split out of `ingestColombia` purely so it can be tested
 * without a network call — the failure it guards against is silent: a 5-day
 * request that quietly fetches and writes two months of rows reads, in the
 * output, exactly like a 5-day request that worked.
 *
 * `days` wins outright when set. The two are NOT reconciled: asking for 5
 * days with 1 month used to be expressible and meant neither of them.
 */
export function resolveIngestWindow(
  options: Pick<IngestColombiaOptions, "months" | "days">,
  now: Date = new Date(),
): { sinceDate: Date; useDays: boolean } {
  const useDays = !!options.days && options.days > 0;
  const sinceDate = new Date(now);
  if (useDays) sinceDate.setDate(sinceDate.getDate() - options.days!);
  // The 6-month fallback is for months <= 0 only — a caller that passed
  // nothing meaningful, not a caller that asked for a narrow window.
  else sinceDate.setMonth(sinceDate.getMonth() - (options.months > 0 ? options.months : 6));
  return { sinceDate, useDays };
}

/**
 * Combines what used to be two separate manual CLI steps (ingest-colombia-
 * live.ts for the tender list, ingest-colombia-documents.ts run once per
 * tender for its documents) into one admin action — per the user's
 * explicit request (2026-09-04): "拉2个月哥伦比亚数据+附件".
 *
 * The document-fetch step deliberately reuses `row.id_del_proceso` from
 * THIS SAME live fetch, never re-derived from an already-stored tender's
 * tenderNumber — colombia-documents-connector.ts's own header comment
 * warns those aren't guaranteed to be the same value (mapSecopRowToTender
 * prefers the human-readable `referencia_del_proceso` for tenderNumber
 * when present, which is a different id namespace than `id_del_proceso`).
 * Which slugs were ACTUALLY written (as opposed to excluded/tombstoned/
 * failed) is confirmed by re-querying Supabase for their ids after the
 * upsert, rather than trying to reconstruct that from
 * upsertTendersBatched()'s aggregate counts — a tender that upsertTenders
 * Batched silently skipped (excluded tier, or a manual-deletion tombstone)
 * simply won't come back from that query, so documents are correctly never
 * fetched for it.
 */
export async function ingestColombia(supabase: SupabaseClient, options: IngestColombiaOptions): Promise<IngestColombiaResult> {
  const { sinceDate, useDays } = resolveIngestWindow(options);

  const rows = await fetchSecopProcesos({ sinceDate, maxPages: options.maxPages });

  const mapped: { row: SecopProcesoRow; tender: Tender }[] = [];
  for (const row of rows) {
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    if (tender) mapped.push({ row, tender });
  }

  // Same window on both sides. The server-side `$where` above already cut
  // the fetch to it, so this is belt-and-braces rather than the real gate —
  // but a row whose publication date is ESTIMATED passes every window
  // (see recency.ts's known blind spot), and letting the two disagree is
  // how a 5-day import quietly writes two months of rows.
  const keptTenders = useDays
    ? filterTendersPublishedWithinDays(mapped.map((m) => m.tender), options.days!)
    : filterRecentTenders(mapped.map((m) => m.tender), options.months);
  const keptSlugs = new Set(keptTenders.map((t) => t.slug));
  const kept = mapped.filter((m) => keptSlugs.has(m.tender.slug));

  const result: IngestColombiaResult = {
    fetchedCount: rows.length,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    months: options.months,
  };

  // A dry run's whole job is "show me what a write would do before I do it",
  // and it used to stop here — reporting `kept`, the count of rows that
  // MAPPED. That number is roughly ten times the number that would actually
  // be written, because both gates that reject a tender live inside
  // upsertTendersBatched, past this early return. A real run of this on
  // 2026-09-15 printed "kept 1222" for a window whose real write count was
  // in the low hundreds; the dry run was answering a different question
  // than the one it was being asked.
  //
  // Both gates are pure functions over a Tender, so the dry run can apply
  // them exactly rather than estimating. The ONE thing it still cannot see
  // is the manual-deletion tombstone check, which needs the database — so
  // the real write count is this number or slightly lower, never higher,
  // and the caller says so.
  if (!options.write) {
    const closed = kept.filter((m) => isPastSubmissionDeadline(m.tender));
    const open = kept.filter((m) => !isPastSubmissionDeadline(m.tender));
    const excluded = open.filter((m) => m.tender.relevance.tier === "excluded");
    result.dryRunClosedCount = closed.length;
    result.dryRunExcludedCount = excluded.length;
    result.dryRunWouldWriteCount = open.length - excluded.length;
    result.dryRunExcludedReasons = {};
    for (const m of excluded) {
      const reason = m.tender.relevance.reason.zh;
      result.dryRunExcludedReasons[reason] = (result.dryRunExcludedReasons[reason] ?? 0) + 1;
    }
    result.dryRunTierCounts = {};
    for (const m of open) {
      if (m.tender.relevance.tier === "excluded") continue;
      result.dryRunTierCounts[m.tender.relevance.tier] = (result.dryRunTierCounts[m.tender.relevance.tier] ?? 0) + 1;
    }
    return result;
  }

  const { upsertedCount, skippedExcludedCount, protectedCount, skippedManuallyDeletedCount, failed } = await upsertTendersBatched(
    supabase,
    kept.map((m) => m.tender),
  );
  result.upsertedCount = upsertedCount;
  result.skippedExcludedCount = skippedExcludedCount;
  result.protectedCount = protectedCount;
  result.skippedManuallyDeletedCount = skippedManuallyDeletedCount;
  result.failed = failed;

  if (!options.fetchDocuments) return result;

  const candidateSlugs = kept.map((m) => m.tender.slug);
  const idBySlug = new Map<string, string>();
  for (const slugChunk of chunk(candidateSlugs, DOCUMENTS_PAGE_SIZE)) {
    const { data, error } = await supabase.from("tenders").select("id, slug").in("slug", slugChunk);
    if (error) {
      console.error(`  Failed to look up which Colombia tenders were actually written: ${error.message}`);
      continue;
    }
    for (const row of data ?? []) idBySlug.set(row.slug as string, row.id as string);
  }

  const documentCandidates = kept.filter(
    (m) => idBySlug.has(m.tender.slug) && (m.row.id_del_portafolio || m.row.id_del_proceso || extractNoticeUidFromUrl(m.row.urlproceso?.url)),
  );
  result.documentsCandidateTenders = documentCandidates.length;

  let documentsDownloaded = 0;
  let documentsAlreadyOnFile = 0;
  let documentsFailed = 0;
  // Tracked separately from documentsDownloaded/documentsFailed so a future
  // real run can tell apart "the archivos-metadata dataset (dmgg-8hin) has
  // zero rows for these tenders' id_del_proceso" from "rows exist but every
  // one is post-award" from "downloads themselves are failing" — the first
  // real bulk run (2026-09-04) came back with 0 downloaded / 0 failed /
  // 0 already-on-file across 499 candidates, which is consistent with any
  // of those three but was previously indistinguishable from the exposed
  // stats alone.
  let documentsMetadataRowsFound = 0;
  let documentsSkippedPostAward = 0;
  let documentsFoundViaNoticeUid = 0;
  let documentsFoundViaIdDelProceso = 0;
  let documentsFoundViaPortfolio = 0;

  // One-time diagnostic (2026-09-04, after the first real bulk run came
  // back with 0 metadata rows for all 499 candidates): print a few real
  // `proceso` values from the archivos dataset next to a few real
  // `id_del_proceso` values from THIS run's own candidates, so a human
  // watching the server console can immediately see whether the two
  // datasets' ids are actually the same shape/namespace — no guessing.
  if (documentCandidates.length > 0) {
    try {
      const sample = await fetchSecopDocumentsSample(5);
      console.log(
        `  [diag] archivos-metadata sample "proceso" values: ${JSON.stringify(sample.map((d) => d.proceso))}`,
      );
    } catch (err) {
      console.log(`  [diag] archivos-metadata sample fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log(
      `  [diag] this run's own "id_del_proceso" values (first 5 of ${documentCandidates.length}): ${JSON.stringify(documentCandidates.slice(0, 5).map((m) => m.row.id_del_proceso))}`,
    );
    console.log(
      `  [diag] this run's own "noticeUID" values parsed from urlproceso.url (first 5): ${JSON.stringify(documentCandidates.slice(0, 5).map((m) => extractNoticeUidFromUrl(m.row.urlproceso?.url)))}`,
    );
  }

  for (const { row, tender } of documentCandidates) {
    const tenderId = idBySlug.get(tender.slug)!;
    // id_del_portafolio FIRST (2026-09-25). The archivos dataset's
    // `proceso` column holds CO1.BDOS.* ids, and that is exactly what the
    // process dataset carries as id_del_portafolio: 40 of 40 recent
    // licitaciones matched on it, while the noticeUID (CO1.NTC.*) and
    // id_del_proceso (CO1.REQ.*) lookups tried before it matched 0 of 40 —
    // which is why Colombian tenders kept landing in 待补文件. The older
    // two stay as fallbacks; they cost a request only when the first misses.
    const noticeUid = extractNoticeUidFromUrl(row.urlproceso?.url);
    const portfolioId = row.id_del_portafolio?.trim();
    const procesoIdCandidates = [...new Set([portfolioId, noticeUid, row.id_del_proceso].filter((v): v is string => !!v))];

    try {
      let docs: Awaited<ReturnType<typeof fetchSecopDocumentsForProcess>> = [];
      let matchedVia: "portfolio" | "noticeUID" | "id_del_proceso" | undefined;
      for (const candidateId of procesoIdCandidates) {
        const attempt = await fetchSecopDocumentsForProcess(candidateId);
        if (attempt.length > 0) {
          docs = attempt;
          matchedVia = candidateId === portfolioId ? "portfolio" : candidateId === noticeUid ? "noticeUID" : "id_del_proceso";
          break;
        }
      }
      if (matchedVia === "portfolio") documentsFoundViaPortfolio++;
      if (matchedVia === "noticeUID") documentsFoundViaNoticeUid++;
      if (matchedVia === "id_del_proceso") documentsFoundViaIdDelProceso++;

      documentsMetadataRowsFound += docs.length;
      const preAward = docs.filter(isPreAwardDocument);
      documentsSkippedPostAward += docs.length - preAward.length;

      for (const doc of preAward) {
        const sourceUrl = doc.url_descarga_documento?.url;
        const fileName = doc.nombre_archivo;
        if (!sourceUrl || !fileName) {
          documentsFailed++;
          continue;
        }

        const { data: existing } = await supabase.from("tender_documents").select("id").eq("source_url", sourceUrl).maybeSingle();
        if (existing) {
          documentsAlreadyOnFile++;
          continue;
        }

        try {
          const bytes = await downloadSecopDocument(sourceUrl);
          const outDir = join("downloads", "colombia", tender.slug);
          if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
          writeFileSync(join(outDir, fileName), bytes);

          const contentHash = createHash("sha256").update(bytes).digest("hex");
          const isPdf = (doc.extensi_n ?? "").toLowerCase() === "pdf";

          const { error } = await supabase.from("tender_documents").insert({
            tender_id: tenderId,
            file_name: fileName,
            document_type: "unknown",
            source_url: sourceUrl,
            content_hash: contentHash,
            extraction_status: isPdf ? "pending" : "not_extractable",
          });
          if (error) {
            console.error(`  failed to record ${fileName} for ${tender.slug}: ${error.message}`);
            documentsFailed++;
          } else {
            documentsDownloaded++;
          }
        } catch (err) {
          console.error(`  failed to download document for ${tender.slug}: ${err instanceof Error ? err.message : String(err)}`);
          documentsFailed++;
        }
      }
    } catch (err) {
      console.error(
        `  failed to fetch document list for proceso candidates=${JSON.stringify(procesoIdCandidates)} (${tender.slug}): ${err instanceof Error ? err.message : String(err)}`,
      );
      documentsFailed++;
    }
  }

  result.documentsDownloaded = documentsDownloaded;
  result.documentsAlreadyOnFile = documentsAlreadyOnFile;
  result.documentsFailed = documentsFailed;
  result.documentsMetadataRowsFound = documentsMetadataRowsFound;
  result.documentsSkippedPostAward = documentsSkippedPostAward;
  result.documentsFoundViaNoticeUid = documentsFoundViaNoticeUid;
  result.documentsFoundViaIdDelProceso = documentsFoundViaIdDelProceso;
  result.documentsFoundViaPortfolio = documentsFoundViaPortfolio;
  console.log(
    `  [diag] metadata rows matched via id_del_portafolio: ${documentsFoundViaPortfolio} candidate(s); via noticeUID: ${documentsFoundViaNoticeUid}; via id_del_proceso: ${documentsFoundViaIdDelProceso}.`,
  );

  return result;
}

export type RefreshColombiaResult = {
  trackedCount: number;
  fetchedCount: number;
  mappedCount: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  protectedCount?: number;
  skippedManuallyDeletedCount?: number;
  failed?: { slug: string; error: string }[];
};

/**
 * Refreshes every Colombia tender ALREADY in our database, regardless of
 * how long ago it was published — a genuinely different operation from
 * `ingestColombia()` above, which only ever discovers tenders within a
 * recent publication-date window. Real gap found 2026-09-05: the admin's
 * "刷新已有标书状态" button originally just re-ran `ingestColombia()`
 * against the same window as "拉取并写入" — so a tender published outside
 * that window (e.g. `secop-101147`, `secop-sdm-lp-80-2026`) was never
 * re-fetched no matter how many times the user clicked it, even though a
 * tender's dynamic fields (submission deadline, status, awarded
 * provider/date/value) can keep changing on SECOP's side long after its
 * own publication date has aged out of any reasonable discovery window.
 *
 * Looks up our own already-tracked `tender_number` values first (this is
 * `referencia_del_proceso`/`id_del_proceso` — see mapSecopRowToTender),
 * then fetches exactly those specific processes back from Socrata by
 * reference (`fetchSecopProcesosByReference` — no date filter at all),
 * re-maps, and upserts. Every real field this pass turns up completely
 * overwrites the stored row via the normal upsert-by-slug path — same
 * "no separate refresh logic" posture as ingestColombia().
 *
 * Of what comes back, only processes we ALREADY track are kept (see the
 * filter below). Until scripts/migrate-colombia-slugs.ts has re-keyed the
 * stored rows onto the entity-qualified slug scheme that filter matches
 * nothing and this pass is a no-op — `mappedCount: 0` against a non-zero
 * `fetchedCount` is exactly what an unmigrated database looks like here.
 */
export async function refreshColombiaTenders(supabase: SupabaseClient, options: { write: boolean }): Promise<RefreshColombiaResult> {
  const PAGE_SIZE = 1000;
  const tenderNumbers: string[] = [];
  const trackedSlugs = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("tenders").select("slug, tender_number").like("slug", "secop-%").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to list already-tracked Colombia tenders: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.tender_number) tenderNumbers.push(row.tender_number as string);
      if (row.slug) trackedSlugs.add(row.slug as string);
    }
    if (data.length < PAGE_SIZE) break;
  }

  const rows = await fetchSecopProcesosByReference(tenderNumbers);

  const mapped: Tender[] = [];
  for (const row of rows) {
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    // A lookup by reference is a lookup by an ENTITY-LOCAL number
    // (buildSecopSlug in colombia-mapper.ts), so asking for one tracked
    // tender's "LP-002-2026" hands back every other entity's LP-002-2026
    // too. Refreshing what we track must not quietly ingest strangers' —
    // discovery is ingestColombia()'s job and it has a date window for a
    // reason. Before the slug fix those strangers landed on OUR slug and
    // overwrote the very tender this pass was supposed to be refreshing.
    if (tender && trackedSlugs.has(tender.slug)) mapped.push(tender);
  }

  const result: RefreshColombiaResult = {
    trackedCount: tenderNumbers.length,
    fetchedCount: rows.length,
    mappedCount: mapped.length,
  };

  if (!options.write) return result;

  const { upsertedCount, skippedExcludedCount, protectedCount, skippedManuallyDeletedCount, failed } = await upsertTendersBatched(supabase, mapped);
  result.upsertedCount = upsertedCount;
  result.skippedExcludedCount = skippedExcludedCount;
  result.protectedCount = protectedCount;
  result.skippedManuallyDeletedCount = skippedManuallyDeletedCount;
  result.failed = failed;
  return result;
}
