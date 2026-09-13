/**
 * Analyses every tender document in a folder ON THIS MACHINE and writes the
 * results straight to Supabase — the browser never uploads a byte.
 *
 * Built 2026-09-11 because the web upload flow was unusable for the real
 * files: single tender documents reach 100MB, and pushing a folder of them
 * through a browser upload, into a serverless request body, took longer than
 * the analysis itself. Running locally, the file is already where it needs to
 * be; only the extracted fields travel.
 *
 * Deliberately thin. Matching a document to its tender is
 * match-documents-to-tenders.ts (shared with npm run analyze:batch, so both
 * file the same document against the same tender), and the analysis and write
 * are analyzeUploadedDocument() (shared with the web upload flow, so a
 * document analysed locally is recorded, deduplicated by hash and merged
 * exactly as an uploaded one is). This module only walks the folder, groups
 * by tender, and reports progress.
 *
 * Grouping matters: analyzeUploadedDocument() takes all of one tender's
 * documents at once and merges their extractions into a single set of fields
 * (one-line summary, qualifications, experience, required documents, risks).
 * Calling it once per file would make each write overwrite the last, so a
 * tender with a Pliego and three Anexos would end up with only the last
 * annex's requirements.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeUploadedDocument, type AnalyzeUploadedDocumentResult } from "@/lib/ingestion/analyze-uploaded-document";
import { isSystematicFailureError, shouldAbortBatch } from "@/lib/ingestion/extraction-failure";
import { findDocuments, loadKnownTenders, resolveTender } from "@/lib/ingestion/match-documents-to-tenders";

export type LocalFolderProgress = {
  stage: "matching" | "analyzing" | "done";
  message: string;
  /** 0-based index of the tender being analysed, once matching is finished. */
  current?: number;
  total?: number;
};

export type AnalyzeLocalFolderResult = {
  filesFound: number;
  tendersMatched: number;
  /** One line per file that could not be filed against a tender, with the reason. */
  skipped: string[];
  /** One entry per TENDER — the upload flow merges a tender's documents into a single result. */
  results: (AnalyzeUploadedDocumentResult & { tenderSlug: string })[];
  /** Tenders whose analysis threw; the rest of the run still completed. */
  failed: { tenderSlug: string; error: string }[];
  /**
   * Set only when the run stopped early on purpose. `remaining` tenders
   * were never attempted and never billed — the distinction the caller
   * has to surface, since "3 failed" and "3 failed, 47 never tried" look
   * identical otherwise.
   */
  aborted?: { reason: string; remaining: number };
};

export async function analyzeLocalFolder(
  supabase: SupabaseClient,
  folderPath: string,
  options: { write: boolean; force: boolean; onProgress?: (progress: LocalFolderProgress) => void },
): Promise<AnalyzeLocalFolderResult> {
  const files = findDocuments(folderPath);
  const skipped: string[] = [];
  const byTender = new Map<string, string[]>();

  options.onProgress?.({ stage: "matching", message: `在 ${folderPath} 找到 ${files.length} 个文件，正在匹配项目…` });

  const knownTenders = await loadKnownTenders(supabase);
  for (const file of files) {
    const resolved = await resolveTender(supabase, file, knownTenders);
    if ("skip" in resolved) {
      skipped.push(resolved.skip);
      continue;
    }
    const group = byTender.get(resolved.tender.slug);
    if (group) group.push(file);
    else byTender.set(resolved.tender.slug, [file]);
  }

  const results: (AnalyzeUploadedDocumentResult & { tenderSlug: string })[] = [];
  const failed: { tenderSlug: string; error: string }[] = [];
  const entries = [...byTender.entries()];

  // Every tender in this loop costs real model calls, so the loop stops
  // rather than confirming a verdict it already has (2026-09-13: five
  // tenders, five identical failures, five bills). Two triggers —
  // a failure classified as systematic, and a run where nothing has
  // succeeded and failures are simply stacking up. See extraction-
  // failure.ts for why "unrecognised" counts as per-document, and why
  // the consecutive threshold is 2 rather than 1.
  let consecutiveFailures = 0;
  let abortedAfter: { index: number; reason: string } | null = null;

  for (const [index, [tenderSlug, paths]] of entries.entries()) {
    options.onProgress?.({
      stage: "analyzing",
      message: `${tenderSlug} — ${paths.length} 个文件`,
      current: index,
      total: entries.length,
    });
    try {
      // Read here, not during matching: holding every file of a large folder
      // in memory at once is exactly the failure this tool exists to avoid.
      const buffers = paths.map((path) => ({ buffer: readFileSync(path), fileName: basename(path) }));
      const analysed = await analyzeUploadedDocument(supabase, tenderSlug, buffers, { write: options.write, force: options.force });
      results.push({ ...analysed, tenderSlug });
    } catch (err) {
      // One tender's failure must not discard the analyses already paid for
      // in this run — same reasoning as analyzeUploadedDocument()'s own
      // per-file handling.
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ tenderSlug, error: message });
      consecutiveFailures += 1;

      if (isSystematicFailureError(err)) {
        abortedAfter = { index, reason: message };
      } else if (shouldAbortBatch({ consecutiveFailures, anySucceeded: results.length > 0 })) {
        abortedAfter = {
          index,
          reason: `连续 ${consecutiveFailures} 个项目失败且没有一个成功，已中止，未继续调用模型。最后一个报错：${message}`,
        };
      }
      if (abortedAfter) break;
      continue;
    }
    consecutiveFailures = 0;
  }

  const remaining = abortedAfter ? entries.length - (abortedAfter.index + 1) : 0;
  options.onProgress?.({
    stage: "done",
    message: abortedAfter ? `已中止，剩余 ${remaining} 个未处理` : "完成",
    current: abortedAfter ? abortedAfter.index + 1 : entries.length,
    total: entries.length,
  });
  return {
    filesFound: files.length,
    tendersMatched: entries.length,
    skipped,
    results,
    failed,
    aborted: abortedAfter ? { reason: abortedAfter.reason, remaining } : undefined,
  };
}
