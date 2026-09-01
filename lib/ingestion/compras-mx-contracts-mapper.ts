import type { Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { inferGovernmentLevel, inferParticipationScope } from "@/lib/ingestion/heuristics";
import { classifyRelevance } from "@/lib/relevance";

/**
 * One row of the real "Datos Abiertos" contracts export
 * (comprasmx.buengobierno.gob.mx/datos-abiertos → "Contratos ingresados a
 * CompraNet"), confirmed against actual files the user provided
 * (contratos_comprasmx_2025.csv, 73 columns, verified with pandas — not
 * guessed). Only the columns this mapper actually reads are typed; the
 * real file has more (supplier RFC, RUPC folio, contract amendments,
 * etc.) not yet mapped into our Tender schema — see README.
 *
 * IMPORTANT: this file is a CONTRACTS/AWARDS export, not an open-tenders
 * feed — every row we inspected already had a formalized contract. That
 * makes it excellent for historical intelligence (winners, award values,
 * pricing) but it is NOT the source for "tenders still open to bid on" —
 * that's compras-mx-open-tenders-mapper.ts, see lib/ingestion/README.md.
 */
export type ComprasMxContractRow = {
  "Orden de gobierno"?: string;
  "Descripción Ramo"?: string;
  "Institución"?: string;
  "Código del expediente"?: string;
  "Título del expediente"?: string;
  "Ley"?: string;
  "Tipo Procedimiento"?: string;
  "Número de procedimiento"?: string;
  "Tipo de contratación"?: string;
  "Carácter del procedimiento"?: string;
  "Fecha de publicación"?: string;
  "Fecha de apertura"?: string;
  "Fecha de fallo"?: string;
  "Título del contrato"?: string;
  "Descripción del contrato"?: string;
  "Estatus DRC"?: string;
  "Estatus Contrato"?: string;
  "Importe DRC"?: string;
  "Monto sin imp./máximo"?: string;
  "Moneda"?: string;
  "Dirección del anuncio"?: string;
};

const SCOPE_TYPE_KEYWORDS: [RegExp, TenderScopeType][] = [
  [/obra/i, "works"],
  [/arrendamiento/i, "equipment"],
  [/adquisici[óo]n/i, "equipment"],
  [/servicio/i, "services"],
];

function inferScopeType(tipoContratacion: string | undefined): TenderScopeType {
  if (!tipoContratacion) return "services";
  for (const [pattern, scopeType] of SCOPE_TYPE_KEYWORDS) {
    if (pattern.test(tipoContratacion)) return scopeType;
  }
  return "services";
}

/** "Orden de gobierno" is a direct field (APF confirmed = federal), not a name heuristic — far more reliable than OCDS/CompraNet 5.0's buyer-name guessing. Falls back to the buyer-name heuristic only when the code isn't recognized. */
function inferGovernmentLevelFromOrden(
  ordenDeGobierno: string | undefined,
  buyerName: string,
): Tender["governmentLevel"] {
  if (ordenDeGobierno === "APF") return "federal";
  if (ordenDeGobierno?.startsWith("GE")) return "state";
  return inferGovernmentLevel(buyerName);
}

function inferStatus(estatusContrato: string | undefined, estatusDrc: string | undefined): TenderStatus {
  if (estatusContrato?.toUpperCase().includes("FORMALIZADO")) return "awarded";
  if (estatusDrc?.toUpperCase() === "PUBLICADO") return "open";
  return "submission_closed";
}

/**
 * Handles both real-world date formats seen in this export:
 * "dd/mm/yyyy" (e.g. Fecha de inicio del contrato) and
 * "yyyy/m/d h:mm" (e.g. Fecha de publicación). Falls back to Date's own
 * parser, then returns null rather than producing an invalid date.
 */
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;

  const slashYearFirst = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashYearFirst) {
    const [, year, month, day] = slashYearFirst;
    const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const generic = new Date(raw);
  if (!Number.isNaN(generic.getTime())) return generic.toISOString();

  return null;
}

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function buildKeyDates(row: ComprasMxContractRow, tenderNumber: string): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [];
  const publication = parseDate(row["Fecha de publicación"]);
  const opening = parseDate(row["Fecha de apertura"]);
  const award = parseDate(row["Fecha de fallo"]);

  if (publication) dates.push({ id: `${tenderNumber}-publication`, type: "publication", date: publication });
  if (opening) dates.push({ id: `${tenderNumber}-opening`, type: "opening", date: opening });
  if (award) dates.push({ id: `${tenderNumber}-award`, type: "award", date: award });

  return dates;
}

export function mapComprasMxContractRowToTender(
  row: ComprasMxContractRow,
  sourceName: string,
): Tender | null {
  const tenderNumber = row["Número de procedimiento"]?.trim() || row["Código del expediente"]?.trim();
  const title = row["Título del expediente"]?.trim();
  const buyer = row["Institución"]?.trim();
  if (!tenderNumber || !title || !buyer) return null;

  const publicationDate = parseDate(row["Fecha de publicación"]);
  if (!publicationDate) return null;

  const summary =
    row["Descripción del contrato"]?.trim() || row["Título del contrato"]?.trim() || title;

  const now = new Date().toISOString();
  const industry = row["Descripción Ramo"]?.trim() || "General";
  const scopeType = inferScopeType(row["Tipo de contratación"]);
  const estimatedValue =
    parseAmount(row["Monto sin imp./máximo"]) ?? parseAmount(row["Importe DRC"]) ?? undefined;
  const currency = row["Moneda"]?.trim();

  return {
    id: crypto.randomUUID(),
    slug: `comprasmx-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Mexico",
    governmentLevel: inferGovernmentLevelFromOrden(row["Orden de gobierno"], buyer),
    industry,
    scopeType,
    procedureType: row["Tipo Procedimiento"]?.trim() || row["Ley"]?.trim() || "Unknown",
    participationScope: inferParticipationScope(row["Carácter del procedimiento"]),
    publicationDate,
    awardDate: parseDate(row["Fecha de fallo"]) ?? undefined,
    estimatedValue,
    currency,
    status: inferStatus(row["Estatus Contrato"], row["Estatus DRC"]),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(row, tenderNumber),
    risks: [],
    relevance: classifyRelevance({ title, summary, industry, scopeType, estimatedValue, currency }),
    sourceName,
    sourceUrl: row["Dirección del anuncio"]?.trim() || "",
    createdAt: now,
    updatedAt: now,
  };
}
