import type { Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { inferGovernmentLevel } from "@/lib/ingestion/heuristics";

/**
 * One row from the "Histórico de CompraNet 5.0" bulk export
 * (comprasmx.buengobierno.gob.mx/datos-abiertos), per the official data
 * dictionary (DD_HISTORICO_CNET5.xlsx). This is the summary/list-level
 * schema — a much smaller field set than a full OCDS release. Confirmed
 * real field names, not guessed; see lib/ingestion/README.md.
 */
export type Compranet5Row = {
  "Código de expediente": string;
  "Carácter"?: string;
  "Nombre del anuncio": string;
  "Dependencia": string;
  "Tipo de Contratación": string;
  "Tipo de Expediente"?: string;
  "Fecha de publicación": string;
  "OCDS"?: string;
};

const SCOPE_TYPE_KEYWORDS: [RegExp, TenderScopeType][] = [
  [/obra/i, "works"],
  [/arrendamiento/i, "equipment"],
  [/adquisici[óo]n/i, "equipment"],
  [/servicio/i, "services"],
];

function inferScopeType(tipoContratacion: string): TenderScopeType {
  for (const [pattern, scopeType] of SCOPE_TYPE_KEYWORDS) {
    if (pattern.test(tipoContratacion)) return scopeType;
  }
  return "services";
}

/**
 * Parses the dictionary's date format defensively — the sheet only says
 * "Fecha" (date) without specifying a format, and real government exports
 * are notoriously inconsistent (dd/mm/yyyy vs. ISO). Falls back to the raw
 * string if it doesn't parse, rather than silently producing an invalid date.
 */
function parseDate(raw: string): string | null {
  const isoAttempt = new Date(raw);
  if (!Number.isNaN(isoAttempt.getTime())) return isoAttempt.toISOString();

  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

/**
 * Maps one CompraNet 5.0 historical row to our Tender schema. This is a
 * summary-level export, so it fills in far fewer fields than
 * ocds-mapper.ts's Layer 1 mapping: no value/currency, no submission
 * deadline, no explicit status. qualifications/experienceRequirements/
 * requiredDocuments/risks stay empty for the same Layer 2 (AI) reason as
 * the OCDS mapper. If the row's OCDS link is present, that's the path to
 * enrich a specific record later — not followed automatically here.
 */
export function mapCompranet5RowToTender(
  row: Compranet5Row,
  sourceName: string,
  sourceUrlBase: string,
): Tender | null {
  const tenderNumber = row["Código de expediente"]?.trim();
  const title = row["Nombre del anuncio"]?.trim();
  const buyer = row["Dependencia"]?.trim();
  if (!tenderNumber || !title || !buyer) return null;

  const publicationDate = parseDate(row["Fecha de publicación"] ?? "");
  if (!publicationDate) return null;

  const now = new Date().toISOString();
  const keyDates: TenderKeyDate[] = [
    { id: `${tenderNumber}-publication`, type: "publication", date: publicationDate },
  ];

  return {
    id: crypto.randomUUID(),
    slug: `cnet5-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    // No description field in this summary export — the title stands in
    // until a record is enriched from its OCDS link (see comment above).
    summary: untranslated(title),
    buyer,
    country: "Mexico",
    governmentLevel: inferGovernmentLevel(buyer),
    industry: "General",
    scopeType: inferScopeType(row["Tipo de Contratación"] ?? ""),
    procedureType: row["Tipo de Expediente"] ?? row["Carácter"] ?? "Unknown",
    publicationDate,
    // Historical (2010–2022, long closed) records with no explicit status
    // field default to submission_closed rather than "open" — an old
    // record still marked "open" would be actively misleading.
    status: "submission_closed",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    sourceName,
    sourceUrl: row["OCDS"]?.trim() || `${sourceUrlBase}${encodeURIComponent(tenderNumber)}`,
    createdAt: now,
    updatedAt: now,
  };
}
