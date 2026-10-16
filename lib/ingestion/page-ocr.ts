/**
 * Page texts for 「按内容选页」 on a SCANNED PDF (user, 2026-10-16: 新功能是否
 * 也能支持图片扫描？→ 建议 A + B).
 *
 * A scan has no text to score, so the pages are read here first, locally and
 * for free, only to decide which ones the model sees:
 *   A. whatever text the PDF already carries — a thin OCR layer, or the
 *      pages of a mixed document that are not scans — from pdftotext;
 *   B. for each page still too thin to score, Tesseract, when it is
 *      installed on this machine (the operator's own, for 本地批量分析).
 * The model still reads the selected pages as images, as before; nothing
 * read here is sent to it. Without Tesseract, the pages A cannot score stay
 * unscored, and a document with no signal reads from page 1 as before.
 *
 * Tesseract is found on PATH, at TESSERACT_PATH, or at the Windows
 * installer's default location. Languages: whichever of Spanish, Portuguese
 * and English are installed.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { extractPdfText } from "@/lib/ingestion/document-intake";

const execFileAsync = promisify(execFile);

/** Below this a page has no text worth scoring — see text-layer.ts's 200-per-page bar. */
const THIN_PAGE_CHARS = 200;
/** Rendered for reading words, not for the model: low resolution, greyscale. */
const OCR_DPI = 150;
const OCR_CONCURRENCY = 4;
const OCR_PAGE_TIMEOUT_MS = 90_000;
const WANTED_LANGUAGES = ["spa", "por", "eng"];

export type Tesseract = { bin: string; languages: string[] };

let cached: Tesseract | null | undefined;

/** The Tesseract on this machine with at least one wanted language, or null. Looked up once. */
export function findTesseract(): Tesseract | null {
  if (cached !== undefined) return cached;
  const candidates = [process.env.TESSERACT_PATH, "tesseract", "C:\\Program Files\\Tesseract-OCR\\tesseract.exe", "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe"].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  for (const bin of candidates) {
    if (bin.includes("\\") && !existsSync(bin)) continue;
    try {
      const out = execFileSync(bin, ["--list-langs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
      const installed = out.split(/\r?\n/).map((line) => line.trim());
      const languages = WANTED_LANGUAGES.filter((language) => installed.includes(language));
      if (languages.length > 0) return (cached = { bin, languages });
    } catch {
      // not this one
    }
  }
  return (cached = null);
}

/** One page (1-based) rendered and read by Tesseract. Empty on any failure — a page that cannot be read just scores nothing. */
async function ocrPage(filePath: string, page: number, tesseract: Tesseract): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "tender-ocr-"));
  try {
    const image = join(dir, "page");
    await execFileAsync("pdftoppm", ["-r", String(OCR_DPI), "-gray", "-png", "-singlefile", "-f", String(page), "-l", String(page), filePath, image], {
      timeout: OCR_PAGE_TIMEOUT_MS,
    });
    const { stdout } = await execFileAsync(tesseract.bin, [`${image}.png`, "stdout", "-l", tesseract.languages.join("+")], {
      // One thread each: OCR_CONCURRENCY processes each spawning one thread
      // per core starve one another — 57 pages ran past ten minutes that
      // way, against 2 s a page single-threaded (measured 2026-10-16).
      env: { ...process.env, OMP_THREAD_LIMIT: "1" },
      encoding: "utf8",
      timeout: OCR_PAGE_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type ScanPageTexts = {
  texts: string[];
  /** Pages whose text came from Tesseract. */
  ocrPages: number;
  /** Pages too thin to score that Tesseract could not be used on (not installed). */
  unreadPages: number;
};

/** Every page's text: the PDF's own where it has enough, Tesseract's where it does not and Tesseract is there. */
export async function pageTextsForScan(filePath: string): Promise<ScanPageTexts> {
  const texts = extractPdfText(filePath).split("\f");
  if (texts.length > 1 && !texts[texts.length - 1].trim()) texts.pop();
  const thin = texts.map((text, index) => (text.trim().length < THIN_PAGE_CHARS ? index : -1)).filter((index) => index >= 0);
  const tesseract = thin.length > 0 ? findTesseract() : null;
  if (!tesseract) return { texts, ocrPages: 0, unreadPages: thin.length };

  let next = 0;
  let ocrPages = 0;
  const worker = async () => {
    while (next < thin.length) {
      const index = thin[next++];
      const text = await ocrPage(filePath, index + 1, tesseract);
      if (text.trim().length > texts[index].trim().length) {
        texts[index] = text;
        ocrPages += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, thin.length) }, worker));
  return { texts, ocrPages, unreadPages: 0 };
}
