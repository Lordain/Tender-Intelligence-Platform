import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

/**
 * Takes tender documents a human already downloaded (Convocatoria, Anexo
 * Técnico, actas, etc.) and does everything *except* the downloading:
 * reads the text, works out which tender each file belongs to, classifies
 * what kind of document it is, and hashes it so the same file is never
 * analysed twice.
 *
 * Why it stops at "except the downloading": the Compras MX document
 * endpoint (`norah/documentos/recursos/ulck`) is behind the same
 * `grc`/`igrc`/`xgrc` anti-automation gate as the search API (confirmed
 * from a real captured request — see lib/ingestion/README.md), so this
 * platform doesn't fetch from it. What it can do is remove essentially all
 * of the *tedious* part of the manual workflow: the operator drops a
 * folder of downloaded PDFs in, and nothing has to be renamed, sorted,
 * matched to a tender, or typed in by hand.
 *
 * Text extraction uses poppler's `pdftotext` for PDFs (present in this
 * environment; verified against a real 50-page Convocatoria), `mammoth`
 * for .docx attachments, and `word-extractor` for legacy .doc
 * attachments (2026-09-03, per the user's report that many tender
 * documents arrive as Word files — both current and legacy-binary
 * format — not PDF) — both pure-JS npm dependencies rather than another
 * external binary like poppler, since they need to run on the user's
 * own machine, not just this sandbox.
 */

/**
 * Procedure number, per the official DD_PIC_CONTRATOS data dictionary:
 * `XX-##-XXX-XXXXXXXXX-X-#-####` (type+ley, ramo, unidad responsable,
 * unidad compradora, carácter, consecutive, year). Real example:
 * `IA-60-N56-901026999-T-50-2026`.
 *
 * The "unidad compradora" segment was originally assumed pure-numeric
 * (`\d+`, matching that one real example) — wrong, confirmed 2026-09-03
 * when a real document (`LO-09-JZO-009JZO001-T-36-2026`, unidad
 * compradora `009JZO001`) went completely unmatched. Widened to
 * `[A-Z0-9]+` like the "unidad responsable" segment next to it — still
 * bounded by the surrounding hyphens either way, so this only accepts
 * more real numbers, it doesn't loosen what counts as a match elsewhere.
 *
 * Boundaries use `(?<![A-Za-z0-9])`/`(?![A-Za-z0-9])`, not `\b` — `\b`
 * treats `_` as a word character, so it fails to match a procedure
 * number an operator glued directly against other text with an
 * underscore (e.g. `LO-09-JZO-009JZO001-T-36-2026_ANEXO.pdf`, a real
 * file-naming style), which is exactly the case this pattern needs to
 * catch when matched against a file name (see intakeDocument() below).
 */
const PROCEDURE_NUMBER_PATTERN = /(?<![A-Za-z0-9])[A-Z]{2}-\d{2}-[A-Z0-9]+-[A-Z0-9]+-[A-Z]-\d+-\d{4}(?![A-Za-z0-9])/g;

/** Expediente code, per the same dictionary: `E` + 4-digit year + 8-digit serial. */
const EXPEDIENTE_CODE_PATTERN = /\bE-\d{4}-\d{8}\b/g;

export type TenderDocumentType =
  | "convocatoria"
  | "anexo_tecnico"
  | "bases"
  | "junta_aclaraciones"
  | "fallo"
  | "contrato"
  | "unknown";

/**
 * Matched against the file name plus the document's opening text, and
 * ordered so that self-titling beats mere mention. A Convocatoria talks
 * about the fallo, the junta de aclaraciones, its Anexo Técnico and the
 * resulting contrato constantly — a real 50-page one tested here mentions
 * "fallo" on its first page — so the acta types require the word "acta",
 * and "convocatoria" is checked before the things a convocatoria refers
 * to. Bare mentions must never win, or every document classifies as
 * whichever type its boilerplate happens to name first.
 *
 * "bases" and the bare `fallo` fallback were added from real PEMEX
 * SharePoint attachment file names (see pemex-mapper.ts), which this
 * function also classifies — filename only, no body text, since those
 * files aren't downloaded. "Bases" (e.g. "02_Bases Iniciales_...zip",
 * "Bases Finales_....zip") is the actual substantive tender-terms
 * document there, distinct enough from Convocatoria to need its own type
 * rather than folding into `anexo_tecnico`, which already means something
 * more specific for Compras MX documents. The bare `fallo` fallback is
 * placed after every self-titling check (convocatoria/anexo_tecnico/
 * bases), so it only ever catches a document that isn't titled as
 * something else first — the same protection `acta de fallo` already
 * gives, just extended to PEMEX's real "Fallo_....pdf" naming, which
 * doesn't use the "acta de" phrasing Compras MX documents do.
 */
const DOCUMENT_TYPE_PATTERNS: [RegExp, TenderDocumentType][] = [
  [/acta\s+de\s+(la\s+)?junta\s+de\s+aclaraciones/i, "junta_aclaraciones"],
  [/acta\s+de\s+fallo/i, "fallo"],
  [/\bconvocatoria\b|\bconvoca\b/i, "convocatoria"],
  [/anexo\s+t[ée]cnico/i, "anexo_tecnico"],
  [/\bbases\b/i, "bases"],
  [/\bfallo\b/i, "fallo"],
  [/\bcontrato\b|\bpedido\b/i, "contrato"],
];

export type TenderDocumentIntake = {
  filePath: string;
  fileName: string;
  contentHash: string;
  byteSize: number;
  documentType: TenderDocumentType;
  /** Procedure number this document belongs to, if one appears in its file name or text. */
  tenderNumber?: string;
  /** Where tenderNumber came from — "filename" is the higher-confidence source, since it means a human deliberately labeled the file (the only signal at all for an attachment whose own text never repeats the number, e.g. a spreadsheet annex). */
  tenderNumberSource?: "filename" | "text";
  /** Expediente code, the other identifier both real Compras MX exports share. */
  expedienteCode?: string;
  textLength: number;
  /** How many times the winning procedure number appears in the document's own text — a weak confidence signal, and 0 when tenderNumber came from the file name instead. */
  tenderNumberOccurrences: number;
};

export function extractPdfText(filePath: string): string {
  // -q keeps poppler's warnings off stdout; "-" writes text to stdout.
  return execFileSync("pdftotext", ["-q", filePath, "-"], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

export async function extractDocxText(filePath: string): Promise<string> {
  const { value } = await mammoth.extractRawText({ path: filePath });
  return value;
}

/**
 * Legacy binary .doc (pre-2007 Word, OLE compound file format — a
 * different, older format from .docx's ECMA-376 zip/XML, not just a
 * naming variant) — mammoth doesn't read this format at all. `word-
 * extractor` (2026-09-03, per the user's report that .doc attachments
 * are common) is pure JS with no external binary or Word/LibreOffice
 * install required, unlike every other real option for this format, so
 * it works the same way on the user's own Windows machine as it does
 * here with nothing extra to install — the same reasoning that ruled
 * out LibreOffice for .docx.
 */
export async function extractDocText(filePath: string): Promise<string> {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(filePath);
  return doc.getBody();
}

/** Dispatches on the real file extension — everything but .docx/.doc is assumed to be a PDF, matching every existing caller's naming/behavior before Word support existed. */
export async function extractDocumentText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".docx") return extractDocxText(filePath);
  if (ext === ".doc") return extractDocText(filePath);
  return extractPdfText(filePath);
}

/** Most frequent match wins: a Convocatoria repeats its own number in every page header (54 times in the real one tested), while any other number it cites appears once or twice. */
function mostFrequentMatch(text: string, pattern: RegExp): { value?: string; occurrences: number } {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(pattern)) {
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, occurrences: bestCount };
}

export function detectDocumentType(text: string, fileName: string): TenderDocumentType {
  const head = `${fileName}\n${text.slice(0, 2000)}`;
  for (const [pattern, type] of DOCUMENT_TYPE_PATTERNS) {
    if (pattern.test(head)) return type;
  }
  return "unknown";
}

export async function intakeDocument(filePath: string): Promise<TenderDocumentIntake> {
  const buffer = readFileSync(filePath);
  const text = await extractDocumentText(filePath);
  const fileName = basename(filePath);
  const expediente = mostFrequentMatch(text, EXPEDIENTE_CODE_PATTERN);

  // A file name the operator deliberately renamed to include the real
  // procedure number (2026-09-03, the user's own suggestion, for exactly
  // the case a text-only match can't handle: an attachment — a
  // spreadsheet annex, a technical-spec doc — whose own body never
  // repeats the number the way a Convocatoria's page headers do) wins
  // outright over the text-frequency heuristic, rather than being folded
  // into the same count — a human labeling the file is higher-confidence
  // than "appears most often."
  const fileNameMatch = fileName.match(PROCEDURE_NUMBER_PATTERN)?.[0];
  const textMatch = mostFrequentMatch(text, PROCEDURE_NUMBER_PATTERN);

  const tenderNumber = fileNameMatch ?? textMatch.value;
  const tenderNumberSource: TenderDocumentIntake["tenderNumberSource"] = fileNameMatch
    ? "filename"
    : textMatch.value
      ? "text"
      : undefined;

  return {
    filePath,
    fileName,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    byteSize: buffer.byteLength,
    documentType: detectDocumentType(text, fileName),
    tenderNumber,
    tenderNumberSource,
    expedienteCode: expediente.value,
    textLength: text.length,
    tenderNumberOccurrences: fileNameMatch ? 0 : textMatch.occurrences,
  };
}
