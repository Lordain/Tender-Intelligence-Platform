import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSecopProcesos } from "@/lib/ingestion/connectors/colombia-secop-live";
import { fetchSecopDocumentsForProcess, downloadSecopDocument, isPreAwardDocument } from "@/lib/ingestion/connectors/colombia-documents-connector";
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
};

const DOCUMENTS_PAGE_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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

  const documentCandidates = kept.filter((m) => idBySlug.has(m.tender.slug) && m.row.id_del_proceso);
  result.documentsCandidateTenders = documentCandidates.length;

  let documentsDownloaded = 0;
  let documentsAlreadyOnFile = 0;
  let documentsFailed = 0;

  for (const { row, tender } of documentCandidates) {
    const tenderId = idBySlug.get(tender.slug)!;
    const procesoId = row.id_del_proceso!;

    try {
      const docs = await fetchSecopDocumentsForProcess(procesoId);
      const preAward = docs.filter(isPreAwardDocument);

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
      console.error(`  failed to fetch document list for proceso=${procesoId} (${tender.slug}): ${err instanceof Error ? err.message : String(err)}`);
      documentsFailed++;
    }
  }

  result.documentsDownloaded = documentsDownloaded;
  result.documentsAlreadyOnFile = documentsAlreadyOnFile;
  result.documentsFailed = documentsFailed;

  return result;
}
