import * as XLSX from "xlsx";
import { classifyStoredTender } from "@/lib/relevance";
import { inferGovernmentLevel } from "@/lib/ingestion/peru-oece-mapper";
import { untranslated } from "@/lib/ingestion/text-utils";
import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";
import type { Tender, TenderScopeType } from "@/types/tender";

/**
 * SEACE's own public search export — 「Buscador de Procedimientos de
 * Selección」 → export, a file called Lista-Procesos.xls — as a manual
 * fallback for the OECE API (user, 2026-10-02: 秘鲁加一个类似墨西哥 ComprasMX
 * 的手动加载入口).
 *
 * Why it is needed: the OECE open-data export stopped on 2026-09-25 — every
 * /files package was regenerated between 12:27 and 13:07 Lima time that day
 * and the live index has had nothing newer since — while entities kept
 * publishing on SEACE itself. The search page still answers a person in a
 * browser, so the admin exports from there.
 *
 * What the file has (real export, 499 rows, 2026-09-30 15:01 → 2026-10-02
 * 08:21), one sheet, header on row 1:
 *   N° | Nombre o Sigla de la Entidad | Fecha y Hora de Publicacion |
 *   Nomenclatura | Reiniciado Desde | Objeto de Contratación |
 *   Descripción de Objeto | VR / VE / Cuantía de la contratación | Moneda |
 *   Versión SEACE
 *
 * The same facts an OECE record gives this platform — number, buyer, title,
 * publication, value, object — and, like OECE, no submission deadline. What
 * it lacks is the procedure name, recovered from the nomenclature prefix
 * below, and the document links (the detail page is keyed by an internal id
 * the export does not carry).
 *
 * Two quirks of the export:
 *   - Curly quotes and dashes come out as "¿" (an encoding loss upstream):
 *     「¿MEJORAMIENTO … UCAYALI¿ ¿ CUI N°2704534」. Restored below as best can be.
 *   - VR / VE is "---" when the entity withholds it (about three rows in four).
 */
export type SeaceListRow = {
  buyer: string;
  publishedAt: string;
  tenderNumber: string;
  restartedFrom: string;
  object: string;
  description: string;
  value: string;
  currency: string;
};

const HEADERS: Record<keyof SeaceListRow, RegExp> = {
  buyer: /^nombre o sigla de la entidad/i,
  publishedAt: /^fecha y hora de publicaci/i,
  tenderNumber: /^nomenclatura/i,
  restartedFrom: /^reiniciado desde/i,
  object: /^objeto de contrataci/i,
  description: /^descripci[óo]n de objeto/i,
  value: /^vr \/ ve/i,
  currency: /^moneda/i,
};

/** Reads Lista-Procesos.xls (or the same sheet saved as .xlsx / .csv). Throws when the columns are not SEACE's. */
export function readSeaceListFile(buffer: Buffer): SeaceListRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  const headerIndex = raw.findIndex((row) => row.some((cell) => HEADERS.tenderNumber.test(String(cell).trim())));
  if (headerIndex < 0) {
    throw new Error("这不像 SEACE「Lista-Procesos」导出：找不到「Nomenclatura」列。请从 SEACE 的 Buscador de Procedimientos 导出后直接上传。");
  }
  const header = raw[headerIndex].map((cell) => String(cell).trim());
  const column = {} as Record<keyof SeaceListRow, number>;
  for (const [key, pattern] of Object.entries(HEADERS) as [keyof SeaceListRow, RegExp][]) {
    const index = header.findIndex((cell) => pattern.test(cell));
    if (index < 0) throw new Error(`SEACE 导出缺少「${pattern.source.replace(/[\\^/]/g, "")}」列，文件格式可能变了。`);
    column[key] = index;
  }
  return raw
    .slice(headerIndex + 1)
    .map((row) => Object.fromEntries(Object.entries(column).map(([key, index]) => [key, String(row[index] ?? "").trim()])) as SeaceListRow)
    .filter((row) => row.tenderNumber);
}

/**
 * The nomenclature's leading code, as the procedure name lib/relevance.ts
 * reads — the price-comparison, direct-award and reverse-auction exclusions
 * all key on it, exactly as they do on an OECE record's procurementMethodDetails.
 */
const PROCEDURES: [RegExp, string][] = [
  [/^LP-ABR\b/i, "Licitación Pública Abreviada"],
  [/^LP\b/i, "Licitación Pública"],
  [/^CP-ABR\b/i, "Concurso Público Abreviado"],
  [/^CP\b/i, "Concurso Público"],
  [/^SIE\b/i, "Subasta Inversa Electrónica"],
  [/^COMPRE\b/i, "Comparación de Precios"],
  [/^DIRECTA\b/i, "Contratación Directa"],
  [/^AS\b/i, "Adjudicación Simplificada"],
  [/^SCI\b/i, "Selección de Consultores Individuales"],
];

export function seaceProcedureType(tenderNumber: string): string {
  const match = PROCEDURES.find(([pattern]) => pattern.test(tenderNumber.trim()));
  if (match) return match[1];
  // CONV-PROC, INTER-PROC, RES-PROC, SEL-PROC, PEC-PROC …: special regimes,
  // named by their code so a reader can look it up.
  return `Procedimiento especial (${tenderNumber.split("-")[0]})`;
}

const SCOPE_BY_OBJECT: [RegExp, TenderScopeType][] = [
  [/consultor[íi]a de obra/i, "services"],
  [/^obra/i, "works"],
  [/^bien/i, "equipment"],
  [/^servicio/i, "services"],
];

/**
 * A restart from the bid-opening stage or later is the same procedure
 * re-running its evaluation, not a new opportunity — whoever was going to bid
 * already has. A restart from the enquiry stage still takes new bidders.
 */
const LATE_RESTART = /admisi[óo]n|puntaje|evaluaci[óo]n|calificaci[óo]n|buena pro|otorgamiento|presentaci[óo]n de (ofertas|propuestas)/i;

export function isLateRestart(row: SeaceListRow): boolean {
  return LATE_RESTART.test(row.restartedFrom);
}

/** 「¿MEJORAMIENTO …¿ ¿ CUI」 → 「"MEJORAMIENTO …" – CUI」. A real "¿…?" question keeps its mark. */
export function repairSeaceText(text: string): string {
  if (/¿[^¿]*\?/.test(text)) return text;
  return text
    .replace(/\s¿\s/g, " – ")
    .replace(/¿/g, '"')
    .replace(/^"([^"]*)"$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** "02/10/2026 08:21" (Lima) → the Lima calendar day as midnight UTC, the shape every OECE row stores. */
function limaDay(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
}

function parseValue(value: string): number | undefined {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function currencyCode(value: string): string | undefined {
  if (/sol/i.test(value)) return "PEN";
  if (/d[óo]lar/i.test(value)) return "USD";
  if (/euro/i.test(value)) return "EUR";
  return undefined;
}

export const SEACE_LIST_SOURCE_NAME = "SEACE — Buscador de Procedimientos de Selección (exportación manual)";

/**
 * Its own slug namespace, `peru-seace-<number>`: an OECE row's slug comes
 * from the OCDS ocid, which this export does not carry. The two are joined
 * on the tender number instead — see adoptSeaceListSlugs() in ingest-peru.ts,
 * which lets the OECE import UPDATE a row first loaded from this file rather
 * than add a second one once the API is back.
 */
export function seaceListSlug(tenderNumber: string): string {
  const ascii = tenderNumber.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `peru-seace-${ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export function mapSeaceListRowToTender(row: SeaceListRow): Tender | null {
  const publicationDate = limaDay(row.publishedAt);
  const title = repairSeaceText(row.description);
  if (!publicationDate || !title || !row.buyer) return null;

  const tenderNumber = row.tenderNumber.trim();
  const procedureType = seaceProcedureType(tenderNumber);
  const scopeType = SCOPE_BY_OBJECT.find(([pattern]) => pattern.test(row.object))?.[1] ?? "services";
  const estimatedValue = parseValue(row.value);
  const currency = currencyCode(row.currency);
  const governmentLevel = inferGovernmentLevel(row.buyer);
  const { industries, relevance } = classifyStoredTender({
    procedureType,
    tenderNumber,
    title,
    summary: title,
    buyer: row.buyer,
    country: "Peru",
    governmentLevel,
    scopeType,
    estimatedValue,
    currency,
    sourceName: SEACE_LIST_SOURCE_NAME,
  });
  const slug = seaceListSlug(tenderNumber);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer: row.buyer,
    country: "Peru",
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    estimatedValue,
    currency: estimatedValue ? currency : undefined,
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [{ id: `${slug}-publication`, type: "publication", date: publicationDate }],
    risks: [],
    relevance,
    sourceName: SEACE_LIST_SOURCE_NAME,
    // The search page: the tender number shown next to this link is its search key, as for OECE rows.
    sourceUrl: SEACE_PUBLIC_SEARCH_URL,
    createdAt: now,
    updatedAt: now,
  };
}
