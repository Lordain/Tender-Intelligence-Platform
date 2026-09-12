/**
 * Page-count and first-N-pages truncation for tender PDFs.
 *
 * Real tender documents run to 900 pages and 100MB (2026-09-11, reported by
 * the user). The whole file used to be base64'd into a single document block,
 * so one such tender cost more in tokens than a hundred normal ones and most
 * of that spend went on annexes, price tables and boilerplate that carry
 * nothing this platform extracts. The requirements, experience rules and
 * qualifying documents live in the opening sections.
 *
 * Uses poppler — `pdfinfo` to count, `pdfseparate` + `pdfunite` to copy the
 * first N pages — the same toolchain document-intake.ts already depends on
 * for `pdftotext`, so this adds no new install requirement. Deliberately not
 * `pdftocairo -pdf`, which re-renders through cairo and can drop or reshape
 * the text layer this pipeline depends on; pdfseparate/pdfunite copy page
 * objects unchanged.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Number of pages, or null when pdfinfo cannot read the file. */
export function countPdfPages(filePath: string): number | null {
  try {
    const out = execFileSync("pdfinfo", [filePath], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const match = out.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export type TruncatedPdf = {
  /** The file to send to the model — the original when no truncation happened. */
  path: string;
  originalPages: number | null;
  /** Pages actually sent. Equals originalPages when nothing was cut. */
  usedPages: number | null;
  truncated: boolean;
  /** Always call. No-op when nothing was written. */
  cleanup: () => void;
};

/**
 * Returns the first `maxPages` pages as a new temp PDF, or the original file
 * untouched when it is already short enough.
 *
 * Never throws: a document that cannot be split is sent whole rather than not
 * at all. Losing the page cap costs money; losing the analysis costs the
 * tender. The caller logs `truncated` either way, so a silently uncapped
 * 900-page file still shows up in the run output as one that was not cut.
 */
export function truncatePdfToPages(filePath: string, maxPages: number): TruncatedPdf {
  const originalPages = countPdfPages(filePath);
  const noop = { path: filePath, originalPages, usedPages: originalPages, truncated: false, cleanup: () => {} };
  if (originalPages === null || originalPages <= maxPages) return noop;

  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "tender-pages-"));
    // pdfseparate writes one file per page, zero-padded to the width of the
    // page count it was given, so the names are reconstructed rather than
    // globbed — a glob would also pick up an unrelated leftover file and
    // pdfunite silently concatenates whatever it is handed.
    execFileSync("pdfseparate", ["-f", "1", "-l", String(maxPages), filePath, join(dir, "page-%d.pdf")], { stdio: "pipe" });
    const parts: string[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const part = join(dir, `page-${page}.pdf`);
      if (!existsSync(part)) break;
      parts.push(part);
    }
    if (parts.length === 0) throw new Error("pdfseparate produced no pages");

    const out = join(dir, "truncated.pdf");
    execFileSync("pdfunite", [...parts, out], { stdio: "pipe" });
    const dirToRemove = dir;
    return {
      path: out,
      originalPages,
      usedPages: parts.length,
      truncated: true,
      cleanup: () => rmSync(dirToRemove, { recursive: true, force: true }),
    };
  } catch (err) {
    if (dir) rmSync(dir, { recursive: true, force: true });
    console.warn(`[pdf-pages] Could not truncate ${filePath} to ${maxPages} pages (${(err as Error).message}); sending the whole document.`);
    return noop;
  }
}
