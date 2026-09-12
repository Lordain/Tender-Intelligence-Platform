import { extname } from "node:path";
import { extractDocumentText } from "@/lib/ingestion/document-intake";

/**
 * Below this many characters of extracted text, treat a PDF as having no
 * real text layer (scanned/image-only) — real reference point 2026-09-03:
 * the 33MB scanned Anexo that started this check's own existence had its
 * own pdftotext output small enough to produce only ~1,561 input tokens
 * when sent as plain text (see extract-requirements.ts's header
 * comments), while every real text-layer PDF tested that day ran well
 * into the tens of thousands of tokens. 500 characters is comfortably
 * below the smallest real text-bearing document seen and comfortably
 * above what a scanned PDF's stray OCR-able caption or metadata text
 * might produce.
 */
const TEXT_LAYER_MIN_CHARS = 500;

/**
 * Used to route a document between providers (see extract-requirements-
 * qwen-anthropic.ts and scripts/extract-tender-document.ts's --provider
 * auto-selection): a scanned/image-only PDF needs Claude's native PDF
 * vision (confirmed the only provider that reads scanned pages correctly
 * after chunking, 2026-09-03), while a document with a real text layer
 * can go to the cheaper qwen-anthropic path.
 *
 * Word docs (.docx/.doc) are always machine-readable text — see
 * extractTenderRequirements()'s own isWord branch — so only PDFs need the
 * real pdftotext check.
 */
export async function hasRealTextLayer(filePath: string): Promise<boolean> {
  if ([".docx", ".doc"].includes(extname(filePath).toLowerCase())) return true;
  const text = await extractDocumentText(filePath);
  return text.trim().length >= TEXT_LAYER_MIN_CHARS;
}
