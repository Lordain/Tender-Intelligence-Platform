import type { Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { inferGovernmentLevel, inferParticipationScope } from "@/lib/ingestion/heuristics";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";

/**
 * One row of the real "Contratos_CompraNet5.csv" bulk export
 * (comprasmx.buengobierno.gob.mx/datos-abiertos), confirmed against the
 * actual header of a real 13,400-row file the user downloaded — NOT the
 * "Histórico de CompraNet 5.0" summary schema (DD_HISTORICO_CNET5.xlsx)
 * this mapper originally assumed. That mismatch (this file's real
 * "Código del expediente"/"Institución"/"Tipo de contratación" vs. the old
 * assumed "Código de expediente"/"Dependencia"/"Tipo de Contratación")
 * silently mapped 0 of 13,400 rows in a real --write run — every row
 * failed the mapper's required-field check, not an encoding or parsing
 * bug. This shape is near-identical to compras-mx-contracts-mapper.ts's
 * (both are Datos Abiertos contract exports from related MX government
 * procurement systems), so the same field-mapping conventions apply here.
 * Only the columns this mapper actually reads are typed; the real file
 * has more (RFC, RUPC folio, contract amendments, etc.) not yet mapped.
 */
export type Compranet5Row = {
  "Orden de gobierno"?: string;
  "Institución"?: string;
  "Código del expediente"?: string;
  "Título del expediente"?: string;
  "Número del procedimiento"?: string;
  "Tipo de contratación"?: string;
  "Tipo de procedimiento"?: string;
  "Carácter del procedimiento"?: string;
  "Fecha de publicación"?: string;
  "Fecha de apertura"?: string;
  "Fecha de fallo"?: string;
  "Título del contrato"?: string;
  "Descripción del contrato"?: string;
  "Estatus del contrato"?: string;
  "Importe del contrato"?: string;
  "Moneda del contrato"?: string;
  "Proveedor o contratista"?: string;
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

/** "Orden de gobierno" is a direct field (APF confirmed = federal) — mirrors inferGovernmentLevelFromOrden in compras-mx-contracts-mapper.ts, which this file's real header also carries. Falls back to the buyer-name heuristic only when the code isn't recognized. */
function inferGovernmentLevelFromOrden(
  ordenDeGobierno: string | undefined,
  buyerName: string,
): Tender["governmentLevel"] {
  if (ordenDeGobierno === "APF") return "federal";
  if (ordenDeGobierno?.startsWith("GE")) return "state";
  return inferGovernmentLevel(buyerName);
}

/**
 * "Estatus del contrato"'s confirmed real values for this file are
 * Activo/Expirado/Terminado (documented in README.md from an earlier
 * column inspection) — a contract lifecycle, not "FORMALIZADO" the way
 * compras-mx-contracts-mapper.ts's "Estatus Contrato" is. Every row here
 * already has a formalized contract (this is a contracts export, not an
 * open-tenders one — same posture as that mapper's own docstring), so all
 * three real values map to "awarded"; "Cancelado" (not yet observed but
 * plausible for this kind of field) is the one value that shouldn't be.
 */
function inferStatus(estatusContrato: string | undefined): TenderStatus {
  if (estatusContrato?.toUpperCase().includes("CANCEL")) return "cancelled";
  return "awarded";
}

/**
 * Handles both real-world date formats seen in this family of exports:
 * "dd/mm/yyyy" and "yyyy/m/d h:mm" (mirrors compras-mx-contracts-mapper.ts's
 * parser, verified against a real MX government file). Falls back to
 * Date's own parser, then returns null rather than producing an invalid date.
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

function buildKeyDates(row: Compranet5Row, tenderNumber: string): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [];
  const publication = parseDate(row["Fecha de publicación"]);
  const opening = parseDate(row["Fecha de apertura"]);
  const award = parseDate(row["Fecha de fallo"]);

  if (publication) dates.push({ id: `${tenderNumber}-publication`, type: "publication", date: publication });
  if (opening) dates.push({ id: `${tenderNumber}-opening`, type: "opening", date: opening });
  if (award) dates.push({ id: `${tenderNumber}-award`, type: "award", date: award });

  return dates;
}

/**
 * Maps one CompraNet 5.0 contracts row to our Tender schema.
 * qualifications/experienceRequirements/requiredDocuments/risks stay
 * empty for the same Layer 2 (AI) reason as every other Layer 1 mapper.
 */
export function mapCompranet5RowToTender(
  row: Compranet5Row,
  sourceName: string,
  sourceUrlBase: string,
): Tender | null {
  const tenderNumber = row["Número del procedimiento"]?.trim() || row["Código del expediente"]?.trim();
  const title = row["Título del expediente"]?.trim();
  const buyer = row["Institución"]?.trim();
  if (!tenderNumber || !title || !buyer) return null;

  const publicationDate = parseDate(row["Fecha de publicación"]);
  if (!publicationDate) return null;

  const summary = row["Descripción del contrato"]?.trim() || row["Título del contrato"]?.trim() || title;

  const now = new Date().toISOString();
  const industries = classifyIndustries(title, summary);
  const scopeType = inferScopeType(row["Tipo de contratación"]);
  const estimatedValue = parseAmount(row["Importe del contrato"]);
  const currency = row["Moneda del contrato"]?.trim();

  return {
    id: crypto.randomUUID(),
    slug: `cnet5-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Mexico",
    governmentLevel: inferGovernmentLevelFromOrden(row["Orden de gobierno"], buyer),
    industries,
    scopeType,
    procedureType: row["Tipo de procedimiento"]?.trim() || "Unknown",
    participationScope: inferParticipationScope(row["Carácter del procedimiento"]),
    publicationDate,
    awardDate: parseDate(row["Fecha de fallo"]) ?? undefined,
    awardedTo: row["Proveedor o contratista"]?.trim() || undefined,
    estimatedValue,
    currency,
    status: inferStatus(row["Estatus del contrato"]),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(row, tenderNumber),
    risks: [],
    relevance: classifyRelevance({ title, summary, industries, scopeType, estimatedValue, currency, buyer }),
    sourceName,
    sourceUrl: row["Dirección del anuncio"]?.trim() || `${sourceUrlBase}${encodeURIComponent(tenderNumber)}`,
    createdAt: now,
    updatedAt: now,
  };
}
