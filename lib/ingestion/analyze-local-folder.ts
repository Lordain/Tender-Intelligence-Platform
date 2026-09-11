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
 * documents at once and merges their extractions into a single set of fields.
 * Calling it once per file would make each write overwrite the last, so a
 * tender with a Pliego and three Anexos would end up with only the last
 * annex's requirements.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeUploadedDocument, type AnalyzeUploadedDocumentResult } from "@/lib/ingestion/analyze-uploaded-document";
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
      failed.push({ tenderSlug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  options.onProgress?.({ stage: "done", message: "完成", current: entries.length, total: entries.length });
  return { filesFound: files.length, tendersMatched: entries.length, skipped, results, failed };
}
