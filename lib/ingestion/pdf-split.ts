import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Splits an oversized PDF into smaller PDFs that each fit Claude's native
 * document limits — real limits hit live 2026-09-03 on a real Proyectos
 * Estratégicos MX PDF (see isPdfNativeLimitError() in
 * extract-requirements.ts): a multi-hundred-page Convocatoria rejected
 * with "A maximum of 100 PDF pages may be provided", and a separate ~33MB
 * scanned Anexo rejected with "Request exceeds the maximum size" (the
 * request's overall ~32MB base64-encoded cap). Both are handled by the
 * same splitter: chunk size is capped by BOTH page count and estimated
 * bytes-per-page, whichever is stricter for a given document.
 *
 * Uses poppler's `pdfseparate` + `pdfunite` — the same toolchain
 * document-intake.ts already requires for `pdftotext`, so no new external
 * binary or npm dependency. If either tool isn't on PATH, the calls below
 * throw and the caller (extract-requirements.ts) falls back to plain-text
 * extraction instead — chunking degrades gracefully, it doesn't hard-fail
 * the whole document.
 *
 * Splitting genuinely loses cross-page context a single native call
 * wouldn't (a requirement whose text spans a chunk boundary, or a "see
 * página 45" reference pointing outside the current chunk) — a real,
 * disclosed tradeoff, not a bug. Each chunk still goes through Claude's
 * native PDF vision (not a text fallback), so a scanned/image-only page
 * is still readable per chunk — the size-based cap above exists
 * specifically for that case, where a text-only fallback would extract
 * nothing at all (see extract-requirements.ts's header comment on the
 * 33MB scanned Anexo, which produced an empty 0/0/0/0 result under the
 * plain-text fallback alone).
 */

export function getPdfPageCount(filePath: string): number {
  const output = execFileSync("pdfinfo", [filePath], { encoding: "utf-8" });
  const match = output.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error(`pdfinfo output for ${filePath} had no "Pages:" line`);
  return Number(match[1]);
}

export type PdfChunk = { path: string; startPage: number; endPage: number; totalPages: number };

const MAX_PAGES_PER_CHUNK = 80; // margin under Claude's real 100-page hard limit
const MAX_CHUNK_BYTES = 20 * 1024 * 1024; // raw bytes; base64 (~1.33x) stays comfortably under the ~32MB request cap

/** Splits `filePath` into chunk PDFs under both limits above. Caller must call the returned `cleanup()` once done reading the chunk files. */
export function splitPdfIntoChunks(filePath: string): { chunks: PdfChunk[]; cleanup: () => void } {
  const totalPages = getPdfPageCount(filePath);
  const fileSize = statSync(filePath).size;
  const bytesPerPage = fileSize / totalPages;
  const sizeBasedLimit = Math.max(1, Math.floor(MAX_CHUNK_BYTES / bytesPerPage));
  const pagesPerChunk = Math.max(1, Math.min(MAX_PAGES_PER_CHUNK, sizeBasedLimit));

  const tmpDir = mkdtempSync(join(tmpdir(), "pdf-chunk-"));
  const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });

  try {
    const chunks: PdfChunk[] = [];
    for (let start = 1; start <= totalPages; start += pagesPerChunk) {
      const end = Math.min(start + pagesPerChunk - 1, totalPages);

      // pdfseparate's %d is filled with the SOURCE document's real page
      // number (not a 1-based sequence within this call), confirmed from
      // poppler's own docs — page-{start}.pdf .. page-{end}.pdf below
      // relies on that.
      execFileSync("pdfseparate", ["-f", String(start), "-l", String(end), filePath, join(tmpDir, "page-%d.pdf")]);

      const pageFiles: string[] = [];
      for (let p = start; p <= end; p++) pageFiles.push(join(tmpDir, `page-${p}.pdf`));

      const chunkPath = join(tmpDir, `chunk-${start}-${end}.pdf`);
      execFileSync("pdfunite", [...pageFiles, chunkPath]);

      chunks.push({ path: chunkPath, startPage: start, endPage: end, totalPages });
    }
    return { chunks, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}
