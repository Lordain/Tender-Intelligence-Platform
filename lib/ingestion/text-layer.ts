import { extname } from "node:path";
import { extractDocumentText } from "@/lib/ingestion/document-intake";
import { getPdfPageCount } from "@/lib/ingestion/pdf-split";

/**
 * The absolute floor, for a document too short for a per-page average to
 * mean anything. Real reference point 2026-09-03: the 33MB scanned Anexo
 * that started this check's existence produced only ~1,561 input tokens as
 * plain text, while every real text-layer PDF tested that day ran well into
 * the tens of thousands.
 */
const TEXT_LAYER_MIN_CHARS = 500;

/**
 * The bar that actually decides it for a multi-page document, and the fix for
 * what 500-flat got wrong (2026-09-16).
 *
 * A 61-page Colombian pliego (DOCUMENTO BASE CCE-EICP-GI-01, a scan with a
 * thin OCR layer) cleared 500 characters easily — a few readable fragments
 * across sixty pages is more than 500 — so it was classified as text-bearing
 * and routed to the qwen path, which sends pdftotext OUTPUT rather than the
 * PDF itself. The model got fragments: enough to write a correct one-line
 * summary, and nothing like enough to find a single qualification. The run
 * reported 0/0/0/0 on a document that is nothing but requirements.
 *
 * A flat total cannot distinguish that from a genuinely readable two-pager;
 * a per-page average can. A real text-bearing page carries 1,500-3,000
 * characters, a scanned page's stray OCR carries tens, so 200 sits an order
 * of magnitude below any real page and an order of magnitude above any scan.
 * A document that fails this goes to Claude's native PDF vision, which reads
 * the image — which is what that routing rule was always for.
 */
const TEXT_LAYER_MIN_CHARS_PER_PAGE = 200;

/**
 * The same test, applied to text already extracted. `pages` is optional only
 * because one caller (the chunked-extraction fallback) may not have a page
 * count to hand; supply it whenever it is known.
 */
export function isTextLayerSubstantial(text: string, pages?: number): boolean {
  const required = Math.max(TEXT_LAYER_MIN_CHARS, (pages ?? 1) * TEXT_LAYER_MIN_CHARS_PER_PAGE);
  return text.trim().length >= required;
}

export async function hasRealTextLayer(filePath: string): Promise<boolean> {
  if ([".docx", ".doc"].includes(extname(filePath).toLowerCase())) return true;
  // Page count is what makes the per-page bar possible, and a PDF that will
  // not even report one is not a PDF this pipeline can read as text.
  let pages: number | undefined;
  try {
    pages = getPdfPageCount(filePath);
  } catch {
    pages = undefined;
  }
  return isTextLayerSubstantial(await extractDocumentText(filePath), pages);
}
