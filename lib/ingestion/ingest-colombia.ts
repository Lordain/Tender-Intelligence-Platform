import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSecopProcesos } from "@/lib/ingestion/connectors/colombia-secop-live";
import { fetchSecopDocumentsForProcess, fetchSecopDocumentsSample, downloadSecopDocument, isPreAwardDocument } from "@/lib/ingestion/connectors/colombia-documents-connector";
import { mapSecopRowToTender, type SecopProcesoRow } from "@/lib/ingestion/colombia-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";

export type IngestColombiaOptions = {
  months: number;
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
};

const DOCUMENTS_PAGE_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Real finding (2026-09-04): `id_del_proceso` from the main process
 * dataset (`CO1.REQ.*`) does NOT match the archivos-metadata dataset's
 * `proceso` column (`CO1.BDOS.*` in a fresh unfiltered sample) — a real
 * bulk run confirmed 0 matching rows across 440+ candidates. The user then
 * manually opened one tender's own `sourceUrl` (community.secop.gov.co,
 * CAPTCHA-gated) and found its address bar carries a THIRD id namespace,
 * `noticeUID=CO1.NTC.*` — and confirmed with their own eyes that this
 * specific tender's detail page really does list real, downloadable
 * attachments. `urlproceso.url` (stored verbatim as `sourceUrl` by
 * colombia-mapper.ts) already carries this exact noticeUID for every
 * tender this connector ever sees — no extra fetch needed to get it.
 * Worth trying against the (CAPTCHA-free, genuinely open) archivos
 * dataset's `proceso` filter before falling back to `id_del_proceso`,
 * since the failure mode of a wrong id is just another empty array, not
 * an error — strictly a "try harder," never worse than the status quo.
 */
function extractNoticeUidFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get("noticeUID")?.trim() || undefined;
  } catch {
    return undefined;
  }
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
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - (options.months > 0 ? options.months : 6));

  const rows = await fetchSecopProcesos({ sinceDate, maxPages: options.maxPages });

  const mapped: { row: SecopProcesoRow; tender: Tender }[] = [];
  for (const row of rows) {
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    if (tender) mapped.push({ row, tender });
  }

  const keptSlugs = new Set(filterRecentTenders(mapped.map((m) => m.tender), options.months).map((t) => t.slug));
  const kept = mapped.filter((m) => keptSlugs.has(m.tender.slug));

  const result: IngestColombiaResult = {
    fetchedCount: rows.length,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    months: options.months,
  };

  if (!options.write) return result;

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
    (m) => idBySlug.has(m.tender.slug) && (m.row.id_del_proceso || extractNoticeUidFromUrl(m.row.urlproceso?.url)),
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
    // Try the real noticeUID (parsed from this tender's own sourceUrl)
    // FIRST — see extractNoticeUidFromUrl's header comment for why this is
    // now believed more likely correct than id_del_proceso. Falls back to
    // id_del_proceso only if the noticeUID lookup comes back empty (or
    // there's no noticeUID to try), same two-attempt-max cost either way.
    const noticeUid = extractNoticeUidFromUrl(row.urlproceso?.url);
    const procesoIdCandidates = [...new Set([noticeUid, row.id_del_proceso].filter((v): v is string => !!v))];

    try {
      let docs: Awaited<ReturnType<typeof fetchSecopDocumentsForProcess>> = [];
      let matchedVia: "noticeUID" | "id_del_proceso" | undefined;
      for (const candidateId of procesoIdCandidates) {
        const attempt = await fetchSecopDocumentsForProcess(candidateId);
        if (attempt.length > 0) {
          docs = attempt;
          matchedVia = candidateId === noticeUid ? "noticeUID" : "id_del_proceso";
          break;
        }
      }
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
  console.log(
    `  [diag] metadata rows matched via noticeUID: ${documentsFoundViaNoticeUid} candidate(s); via id_del_proceso: ${documentsFoundViaIdDelProceso} candidate(s).`,
  );

  return result;
}
