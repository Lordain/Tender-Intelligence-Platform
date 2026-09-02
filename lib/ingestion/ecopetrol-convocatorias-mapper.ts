import type { Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";
import type { EcopetrolConvocatoriaRow } from "@/lib/ingestion/connectors/ecopetrol-convocatorias-file";

/**
 * Maps one row of Ecopetrol's real "Convocatorias públicas en Ley de
 * Garantías" table (see connectors/ecopetrol-convocatorias-file.ts for
 * the real source, the copy-paste intake shape, and the important
 * time-bounded-window caveat). Unlike ecopetrol-contracts-mapper.ts, this
 * covers procedures still being decided (`status: "open"` for `EN
 * TRAMITE` rows) as well as closed ones — the open-tenders counterpart to
 * that mapper's awarded-contracts registry.
 */

const SCOPE_TYPE_KEYWORDS: [RegExp, TenderScopeType][] = [
  [/construcci[óo]n|obra civil|obras civiles/i, "works"],
  [/suministro|compra|adquisici[óo]n|venta/i, "equipment"],
  [/servicio/i, "services"],
];

function inferScopeType(objeto: string): TenderScopeType {
  for (const [pattern, scopeType] of SCOPE_TYPE_KEYWORDS) {
    if (pattern.test(objeto)) return scopeType;
  }
  return "services";
}

/** Only two real values seen so far: CERRADO (closed) and EN TRAMITE (still open/being processed) — an exact lookup, "submission_closed" as the fallback since CERRADO is the overwhelming majority in the real sample. */
function inferStatus(estado: string | undefined): TenderStatus {
  const normalized = estado?.trim().toUpperCase();
  if (normalized === "EN TRAMITE" || normalized === "EN TRÁMITE") return "open";
  return "submission_closed";
}

/**
 * Real format seen: "dd/mm/yyyy h:mm:ss" (e.g. "12/06/2026 0:00:00").
 * Some real rows have a genuinely blank "Fecha apertura del trámite"
 * (seen in the real table — a row with no opening date but a real
 * closing date) — returns null rather than guessing one, same as every
 * other mapper in this project.
 */
function parseDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function mapEcopetrolConvocatoriaRowToTender(row: EcopetrolConvocatoriaRow, sourceName: string, sourceUrl: string): Tender | null {
  const tenderNumber = row["Número de trámite"]?.trim();
  const title = row.Objeto?.trim();
  if (!tenderNumber || !title) return null;

  const publicationDate = parseDate(row["Fecha apertura del trámite"]);
  if (!publicationDate) return null;

  const industries = classifyIndustries(title);
  const scopeType = inferScopeType(title);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    slug: `ecopetrol-conv-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer: "Ecopetrol S.A.",
    country: "Colombia",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType: "Convocatoria Pública",
    publicationDate,
    submissionDeadline: parseDate(row["Fecha cierre del trámite"]) ?? undefined,
    status: inferStatus(row.Estado),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [
      { id: `${tenderNumber}-publication`, type: "publication", date: publicationDate },
      ...(parseDate(row["Fecha cierre del trámite"])
        ? [{ id: `${tenderNumber}-submission`, type: "submission" as const, date: parseDate(row["Fecha cierre del trámite"])! }]
        : []),
    ],
    risks: [],
    relevance: classifyRelevance({ title, industries, scopeType, buyer: "Ecopetrol S.A." }),
    sourceName,
    sourceUrl,
    createdAt: now,
    updatedAt: now,
  };
}
