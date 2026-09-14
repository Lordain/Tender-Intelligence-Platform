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
import { runPool } from "@/lib/ingestion/run-pool";
import { ANALYSIS_CONCURRENCY, BATCH_BUDGET_MS, batchBudgetExhausted, isSystematicFailureError, shouldAbortBatch } from "@/lib/ingestion/extraction-failure";
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

  // Every tender costs real model calls, so the run stops rather than
  // confirming a verdict it already has (2026-09-13: five tenders, five
  // identical failures, five bills). Two triggers — a failure classified as
  // systematic, and a run where nothing has succeeded and failures are
  // simply stacking up. See extraction-failure.ts for why "unrecognised"
  // counts as per-document, and why the threshold is 2 rather than 1.
  let failuresWithNoSuccess = 0;
  // Held in a box rather than a bare `let`: it is written only inside the
  // workers below, and TypeScript's control-flow analysis assumes a closure
  // never runs — a plain variable would be narrowed to `null` for every
  // read after the await. A property read is re-widened across calls.
  type BatchAbort = { index: number; reason: string };
  const abort: { value: BatchAbort | null } = { value: null };
  const startedAt = Date.now();
  // Incremented as each tender FINISHES, so the budget check below and the
  // progress counter both see live state — runPool's own tally is only
  // available once every worker has returned, which is too late for either.
  let finished = 0;

  /**
   * Tenders run several at a time, not one after another.
   *
   * Measured 2026-09-14: one document's model call is ~99s, and almost all
   * of that is waiting on the provider rather than using this machine. Run
   * strictly in sequence, 66 Peru documents is over two hours of mostly
   * idle waiting; at this width it is closer to half an hour. That is the
   * difference between a backlog that gets cleared and one that doesn't.
   *
   * Deliberately small. Each worker holds a tender's files in memory and
   * shells out to poppler, and DashScope is a shared rate limit — four is
   * a real speedup that does not turn one slow provider into a thundering
   * herd. Failure handling is unchanged in meaning: workers stop CLAIMING
   * new tenders once the run is aborting, and whatever is already in
   * flight is allowed to finish rather than being thrown away half-paid.
   */
  const analyseOne = async ([tenderSlug, paths]: (typeof entries)[number], index: number) => {

    options.onProgress?.({
      stage: "analyzing",
      message: `${tenderSlug} — ${paths.length} 个文件`,
      current: finished,
      total: entries.length,
    });

    try {
      // Read here, not during matching: holding every file of a large
      // folder in memory at once is exactly the failure this tool exists
      // to avoid — which is also why the width above stays small.
      const buffers = paths.map((path) => ({ buffer: readFileSync(path), fileName: basename(path) }));
      const analysed = await analyzeUploadedDocument(supabase, tenderSlug, buffers, { write: options.write, force: options.force });
      results.push({ ...analysed, tenderSlug });
      // One success means the failures seen so far were per-document, not
      // a broken run — so the give-up counter stops applying.
      failuresWithNoSuccess = 0;
    } catch (err) {
      // One tender's failure must not discard the analyses already paid
      // for in this run — same reasoning as analyzeUploadedDocument()'s
      // own per-file handling.
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ tenderSlug, error: message });
      if (results.length === 0) failuresWithNoSuccess += 1;

      if (isSystematicFailureError(err)) {
        abort.value ??= { index, reason: message };
      } else if (shouldAbortBatch({ consecutiveFailures: failuresWithNoSuccess, anySucceeded: results.length > 0 })) {
        abort.value ??= {
          index,
          reason: `已有 ${failuresWithNoSuccess} 个项目失败且没有一个成功，已中止，未继续调用模型。最后一个报错：${message}`,
        };
      }
    } finally {
      finished += 1;
    }
  };

  // Stops CLAIMING new tenders once a stop is decided (a systematic
  // failure, the give-up rule, or the run budget); whatever is already in
  // flight still finishes rather than being abandoned half-paid.
  const { completed } = await runPool(entries, ANALYSIS_CONCURRENCY, analyseOne, () => {
    if (abort.value) return true;
    if (finished > 0 && batchBudgetExhausted(startedAt)) {
      abort.value = {
        index: finished - 1,
        reason: `已经跑了 ${Math.round((Date.now() - startedAt) / 60000)} 分钟，超过单次 ${BATCH_BUDGET_MS / 60000} 分钟的上限，已中止，未继续调用模型。`,
      };
      return true;
    }
    return false;
  });
  // runPool counts the same completions; a mismatch would mean a task
  // neither succeeded nor failed, which cannot happen while analyseOne
  // catches everything — asserted rather than assumed.
  if (completed !== finished) finished = Math.max(completed, finished);
  const aborted = abort.value;

  // Workers claim tenders out of order, so a stable report needs sorting
  // back into the folder's own order rather than completion order.
  const order = new Map(entries.map(([slug], i) => [slug, i]));
  results.sort((a, b) => (order.get(a.tenderSlug) ?? 0) - (order.get(b.tenderSlug) ?? 0));
  failed.sort((a, b) => (order.get(a.tenderSlug) ?? 0) - (order.get(b.tenderSlug) ?? 0));

  // What was never attempted, not what was in flight when the stop was
  // decided — those finished and are in results/failed like any other.
  const remaining = aborted ? entries.length - finished : 0;
  options.onProgress?.({
    stage: "done",
    message: aborted ? `已中止，剩余 ${remaining} 个未处理` : "完成",
    current: finished,
    total: entries.length,
  });
  return {
    filesFound: files.length,
    tendersMatched: entries.length,
    skipped,
    results,
    failed,
    aborted: aborted ? { reason: aborted.reason, remaining } : undefined,
  };
}
