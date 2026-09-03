import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import mammoth from "mammoth";

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
 * environment; verified against a real 50-page Convocatoria), and
 * `mammoth` for real .docx attachments (2026-09-03, per the user's
 * report that many tender documents actually arrive as Word files, not
 * PDF) — a pure-JS npm dependency rather than another external binary
 * like poppler, since it needs to run on the user's own machine, not
 * just this sandbox.
 */

/**
 * Procedure number, per the official DD_PIC_CONTRATOS data dictionary:
 * `XX-##-XXX-XXXXXXXXX-X-#-####` (type+ley, ramo, unidad responsable,
 * unidad compradora, carácter, consecutive, year). Real example:
 * `IA-60-N56-901026999-T-50-2026`.
 */
const PROCEDURE_NUMBER_PATTERN = /\b[A-Z]{2}-\d{2}-[A-Z0-9]+-\d+-[A-Z]-\d+-\d{4}\b/g;

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
  /** Procedure number this document belongs to, if one appears in its text. */
  tenderNumber?: string;
  /** Expediente code, the other identifier both real Compras MX exports share. */
  expedienteCode?: string;
  textLength: number;
  /** How many times the winning procedure number appears — a weak confidence signal. */
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

/** Dispatches on the real file extension — everything but .docx is assumed to be a PDF, matching every existing caller's naming/behavior before .docx support existed. */
export async function extractDocumentText(filePath: string): Promise<string> {
  return extname(filePath).toLowerCase() === ".docx" ? extractDocxText(filePath) : extractPdfText(filePath);
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
  const procedure = mostFrequentMatch(text, PROCEDURE_NUMBER_PATTERN);
  const expediente = mostFrequentMatch(text, EXPEDIENTE_CODE_PATTERN);
  const fileName = basename(filePath);

  return {
    filePath,
    fileName,
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    byteSize: buffer.byteLength,
    documentType: detectDocumentType(text, fileName),
    tenderNumber: procedure.value,
    expedienteCode: expediente.value,
    textLength: text.length,
    tenderNumberOccurrences: procedure.occurrences,
  };
}
