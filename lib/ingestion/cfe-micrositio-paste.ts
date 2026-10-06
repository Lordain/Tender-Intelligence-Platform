import type { Tender, TenderKeyDate, TenderParticipationScope, TenderScopeType, TenderStatus } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { CFE_MICROSITIO_URL } from "@/lib/ingestion/heuristics";
import { classifyStoredTender } from "@/lib/relevance";
import { CFE_MICROSITIO_SOURCE_NAME } from "@/lib/relevance-cfe";

/**
 * A CFE procedure pasted from its page on CFE's own micrositio
 * (msc.cfe.mx/Aplicaciones/NCFE/Concursos/Procedure/Details), as a Tender.
 * Added 2026-10-06 (user: 有什么方法我可以快速导入CFE的吗？比如我直接复制整个
 * 页面).
 *
 * Why a paste and not a connector: the micrositio sits behind Imperva and an
 * anti-forgery token (README, "CFE's own portal is WAF-protected"), so this
 * project does not fetch it. The DOF, which it does fetch, carries only CFE's
 * concursos abiertos for goods and services — no works and no concursos
 * simplificados (none of the 104 CFE calls it published 2026-09-01 to
 * 2026-10-06) — and a few days after the micrositio. The admin reads the page
 * in their own browser and pastes its text; this reads that text.
 *
 * The text is what a browser copies from the page: the 「Datos Generales」
 * table as "label<TAB>value" lines (a value can also sit on the next line),
 * then one section per event, each headed "<name> [Tiempo del Centro: …]".
 * Several procedures can be pasted at once; each starts at "Procedimiento No.".
 *
 * Times are Mexico City's, UTC-6: the page's own "(UTC -5 en verano)" is from
 * before Mexico ended daylight saving time in 2022.
 */

export const CFE_MICROSITIO_TIMEZONE = "-06:00";

/** Folds accents one character at a time, so positions in the folded line match the original. */
function fold(text: string): string {
  return [...text].map((char) => char.normalize("NFD")[0]).join("").toLowerCase();
}

const GENERAL_LABELS = [
  "monto adjudicado en pesos mexicanos",
  "descripcion detallada",
  "descripcion del bien",
  "estado del procedimiento",
  "tipo de procedimiento",
  "tipo de contratacion",
  "entidad federativa",
  "area contratante",
  "fecha publicacion",
  "fecha de publicacion",
  "monto adjudicado",
  "testigo social",
  "tipo de moneda",
  "tipo de cambio",
  "adjudicado a",
  "empresa",
] as const;

type GeneralLabel = (typeof GENERAL_LABELS)[number];

export type CfeMicrositioProcedure = {
  number: string;
  general: Partial<Record<GeneralLabel, string>>;
  /** Published files, by description (or file name). */
  files: string[];
  clarifications: string[];
  submissionStart?: string;
  submissionEnd?: string;
  technicalOpening?: string;
  economicOpening?: string;
  siteVisits: string[];
  award?: string;
};

const DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?|hrs?\.?|horas)?)?/gi;

/** Every date on a line, as ISO instants, in order. "06:00:00 p. m." is 18:00; a date without a time is midnight. */
export function cfeDates(line: string): string[] {
  const out: string[] = [];
  for (const match of line.matchAll(DATE)) {
    const [, day, month, year, hourText, minute, suffix] = match;
    let hour = hourText === undefined ? 0 : Number(hourText);
    const meridiem = suffix?.replace(/[\s.]/g, "").toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute ?? "00"}:00${CFE_MICROSITIO_TIMEZONE}`;
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) continue;
    const parsedYear = new Date(parsed).getUTCFullYear();
    if (parsedYear < 2000 || parsedYear > 2100) continue;
    out.push(new Date(parsed).toISOString());
  }
  return out;
}

type Section = "general" | "files" | "clarifications" | "submission" | "technical" | "economic" | "visit" | "award" | "other";

function sectionOf(foldedHeader: string): Section {
  if (foldedHeader.startsWith("datos generales")) return "general";
  if (foldedHeader.startsWith("anexos")) return "files";
  if (foldedHeader.includes("aclaraci")) return "clarifications";
  if (foldedHeader.startsWith("presentacion de ofertas") || foldedHeader.startsWith("presentacion de proposiciones")) return "submission";
  if (foldedHeader.startsWith("apertura de ofertas tecnicas") || foldedHeader.startsWith("apertura tecnica")) return "technical";
  if (foldedHeader.startsWith("apertura de ofertas economicas") || foldedHeader.startsWith("apertura economica")) return "economic";
  if (foldedHeader.includes("visita")) return "visit";
  if (foldedHeader.includes("fallo")) return "award";
  return "other";
}

/** A section heading: "<name> [Tiempo del Centro: …]", or the name alone on its own line. */
function headerOf(line: string): Section | null {
  const folded = fold(line).trim();
  if (/\[tiempo del centro/.test(folded)) return sectionOf(folded.replace(/\s*\[.*$/, ""));
  if (/^(datos generales|anexos de la publicacion|sesion de aclaraciones|presentacion de ofertas.*|apertura de ofertas (tecnicas|economicas)|visita al sitio.*|fallo)$/.test(folded)) {
    return sectionOf(folded);
  }
  return null;
}

function generalLabelOf(line: string): { label: GeneralLabel; value: string } | null {
  const folded = fold(line);
  for (const label of GENERAL_LABELS) {
    if (!folded.startsWith(label)) continue;
    let rest: string;
    if (line.includes("\t")) {
      rest = line.slice(line.indexOf("\t") + 1);
    } else if (label === "descripcion del bien") {
      // The long label, copied without its tab: "… obra ó servicio de obra <value>".
      const end = /servicio de obra|obra/.exec(folded.slice(label.length));
      rest = end ? line.slice(label.length + end.index + end[0].length) : "";
    } else {
      rest = line.slice(label.length);
    }
    return { label, value: rest.replace(/^[\s:]+/, "").trim() };
  }
  return null;
}

/** One pasted procedure, from its "Procedimiento No." line to the next. */
function parseOne(number: string, body: string): CfeMicrositioProcedure {
  const procedure: CfeMicrositioProcedure = { number, general: {}, files: [], clarifications: [], siteVisits: [] };
  let section: Section = "general";
  let pending: GeneralLabel | null = null;

  for (const raw of body.split("\n")) {
    const line = raw.replace(/ /g, " ").replace(/\s+$/, "");
    if (!line.trim()) continue;
    const header = headerOf(line);
    if (header) {
      section = header;
      pending = null;
      continue;
    }

    if (section === "general") {
      const labelled = generalLabelOf(line);
      if (labelled) {
        procedure.general[labelled.label] ??= labelled.value;
        pending = labelled.value ? null : labelled.label;
      } else if (pending) {
        // The value on the line under its label ("Descripción detallada").
        procedure.general[pending] = [procedure.general[pending], line.trim()].filter(Boolean).join(" ");
      }
      continue;
    }

    const dates = cfeDates(line);
    switch (section) {
      case "files": {
        const cells = line.split("\t").map((cell) => cell.trim());
        if (/^archivo$/i.test(cells[0] ?? "")) break;
        const name = cells[1] || cells[0];
        if (name && !cfeDates(name).length) procedure.files.push(name);
        break;
      }
      case "clarifications":
        // Columns: inicio y fin de preguntas, inicio y cierre de la sesión.
        if (dates.length >= 3) procedure.clarifications.push(dates[2]);
        else if (dates.length > 0) procedure.clarifications.push(dates[dates.length - 1]);
        break;
      case "submission":
        // Columns: inicio y fin de la carga de ofertas.
        if (dates.length >= 2 && !procedure.submissionEnd) {
          procedure.submissionStart = dates[0];
          procedure.submissionEnd = dates[1];
        } else if (dates.length === 1 && !procedure.submissionEnd) {
          procedure.submissionEnd = dates[0];
        }
        break;
      case "technical":
        procedure.technicalOpening ??= dates[0];
        break;
      case "economic":
        procedure.economicOpening ??= dates[0];
        break;
      case "visit":
        if (dates[0]) procedure.siteVisits.push(dates[0]);
        break;
      case "award":
        procedure.award ??= dates[0];
        break;
      default:
        break;
    }
  }
  return procedure;
}

/** Splits pasted text into procedures. Text before the first "Procedimiento No." is ignored. */
export function parseCfeMicrositioPaste(text: string): CfeMicrositioProcedure[] {
  const normalised = text.replace(/\r\n?/g, "\n");
  const starts = [...normalised.matchAll(/Procedimiento\s+No\.?\s*:?\s*([A-Z0-9][A-Z0-9-]*[A-Z0-9])/gi)];
  return starts.map((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : normalised.length;
    return parseOne(match[1].toUpperCase(), normalised.slice(match.index + match[0].length, end));
  });
}

/** "0100 - CFE Distribución" → "CFE Distribución"; "CFE - Corporativo" → "CFE Corporativo". */
function unitName(raw: string | undefined): string | undefined {
  const clean = raw?.replace(/^\s*\d+\s*-\s*/, "").replace(/^CFE\s*-\s*/i, "CFE ").replace(/\s+/g, " ").trim();
  return clean || undefined;
}

export function cfeScopeType(tipoContratacion: string | undefined): TenderScopeType {
  const value = fold(tipoContratacion ?? "");
  if (value.includes("obra")) return "works";
  if (value.includes("adquisici") || value.includes("arrendamiento")) return "equipment";
  if (value.includes("servicio")) return "services";
  return "unknown";
}

/** The last letter of the number's type code: CFE-0115-CACON-… is N (nacional). */
export function cfeParticipationScope(number: string): TenderParticipationScope | undefined {
  const coverage = /^CFE-\d{4}-C[AS][A-Z]{2}([NTA])-/i.exec(number)?.[1]?.toUpperCase();
  if (coverage === "N") return "national";
  if (coverage === "T") return "international_treaty";
  if (coverage === "A") return "international_open";
  return undefined;
}

function amount(raw: string | undefined): number | undefined {
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(raw ?? "");
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function currencyOf(raw: string | undefined): string | undefined {
  const value = fold(raw ?? "");
  if (value.includes("peso")) return "MXN";
  if (value.includes("dolar")) return "USD";
  if (value.includes("euro")) return "EUR";
  return undefined;
}

export function cfeStatus(estado: string | undefined, deadline: string | undefined, awardedTo: string | undefined, now: Date): TenderStatus {
  const value = fold(estado ?? "");
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("desiert")) return "deserted";
  if (value.includes("suspend")) return "suspended";
  if (awardedTo) return "awarded";
  if (/adjudicad|fallo|conclu|formaliz|evaluaci|cerrad/.test(value)) return "submission_closed";
  if (deadline && Date.parse(deadline) < now.getTime()) return "submission_closed";
  return "open";
}

/** Procedures a foreign bidder cannot enter: direct awards and invitation-only rounds. */
export function cfeNotOpenReason(procedure: CfeMicrositioProcedure): string | null {
  const tipo = fold(procedure.general["tipo de procedimiento"] ?? "");
  if (tipo.includes("adjudicacion directa")) return "这是直接授标（Adjudicación directa），不是公开招标，不导入。";
  if (tipo.includes("invitacion")) return "这是邀请招标（Invitación），只有受邀企业能参加，不导入。";
  return null;
}

function sentence(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function mapCfeMicrositioProcedure(procedure: CfeMicrositioProcedure, now: Date = new Date()): Tender {
  const general = procedure.general;
  const title = (general["descripcion del bien"] || general["descripcion detallada"] || procedure.number).replace(/\s+/g, " ").trim();
  const detail = general["descripcion detallada"]?.replace(/\s+/g, " ").trim();
  const empresa = unitName(general.empresa);
  const area = unitName(general["area contratante"]);
  const units = [empresa, area && area !== empresa ? area : undefined].filter(Boolean).join(", ");
  const buyer = units ? `Comisión Federal de Electricidad — ${units}` : "Comisión Federal de Electricidad";
  const procedureType = general["tipo de procedimiento"]?.trim() || "Concurso";
  const scopeType = cfeScopeType(general["tipo de contratacion"]);
  const location = general["entidad federativa"]?.trim() || undefined;
  const awardedTo = general["adjudicado a"]?.trim() || undefined;
  const awardedValue = awardedTo ? amount(general["monto adjudicado"]) : undefined;
  const currency = awardedValue !== undefined ? currencyOf(general["tipo de moneda"]) : undefined;

  const submissionDeadline = procedure.submissionEnd ?? procedure.technicalOpening;
  const publicationDate = cfeDates(general["fecha publicacion"] ?? general["fecha de publicacion"] ?? "")[0];

  const slug = procedure.number.toLowerCase().startsWith("cfe-") ? slugify(procedure.number) : `cfe-${slugify(procedure.number)}`;
  const keyDates: TenderKeyDate[] = [];
  if (publicationDate) keyDates.push({ id: `${slug}-publication`, type: "publication", date: publicationDate });
  for (const date of procedure.siteVisits) keyDates.push({ id: `${slug}-site-visit-${keyDates.length}`, type: "site_visit", date });
  for (const date of procedure.clarifications) keyDates.push({ id: `${slug}-clarification-${keyDates.length}`, type: "clarification", date });
  if (procedure.submissionEnd) keyDates.push({ id: `${slug}-submission`, type: "submission", date: procedure.submissionEnd });
  if (procedure.technicalOpening) {
    keyDates.push({
      id: `${slug}-opening-tecnica`,
      type: "opening",
      date: procedure.technicalOpening,
      notes: { es: "Apertura de ofertas técnicas", en: "Technical bid opening", zh: "技术标开标" },
    });
  }
  if (procedure.economicOpening) {
    keyDates.push({
      id: `${slug}-opening-economica`,
      type: "opening",
      date: procedure.economicOpening,
      notes: { es: "Apertura de ofertas económicas", en: "Economic bid opening", zh: "商务标开标" },
    });
  }
  if (procedure.award) keyDates.push({ id: `${slug}-award`, type: "award", date: procedure.award });

  const keyFiles = procedure.files.filter((name) => /convocatoria|pliego|bases|anexo t[ée]cnico|especificaci/i.test(name)).slice(0, 4);
  const summary = [
    sentence(title),
    detail && detail.toLowerCase() !== title.toLowerCase() ? sentence(detail) : undefined,
    sentence(`${procedureType}${general["tipo de contratacion"] ? ` · ${general["tipo de contratacion"].trim()}` : ""}`),
    location ? sentence(`Entidad federativa: ${location}`) : undefined,
    /^s[ií]/i.test(general["testigo social"] ?? "") ? "Con testigo social." : undefined,
    procedure.files.length > 0
      ? sentence(`${procedure.files.length} archivos publicados en el Micrositio de Concursos de CFE${keyFiles.length ? ` (${keyFiles.join("; ")})` : ""}`)
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: "Mexico",
    governmentLevel: "public_company",
    scopeType,
    procedureType,
    tenderNumber: procedure.number,
    sourceName: CFE_MICROSITIO_SOURCE_NAME,
  });
  const participationScope = cfeParticipationScope(procedure.number);
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: procedure.number,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Mexico",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType,
    ...(participationScope ? { participationScope } : {}),
    publicationDate: publicationDate ?? timestamp,
    ...(publicationDate ? {} : { publicationDateIsEstimated: true }),
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(awardedTo ? { awardedTo } : {}),
    ...(awardedValue !== undefined ? { awardedValue } : {}),
    ...(currency ? { currency } : {}),
    ...(location ? { location } : {}),
    status: cfeStatus(general["estado del procedimiento"], submissionDeadline, awardedTo, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: CFE_MICROSITIO_SOURCE_NAME,
    sourceUrl: CFE_MICROSITIO_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
