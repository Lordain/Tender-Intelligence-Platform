import type { Tender, TenderKeyDate, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { inferGovernmentLevelFromProcedureNumber } from "@/lib/ingestion/heuristics";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";
import type { LicitiaVigenteRow } from "@/lib/ingestion/connectors/licitia-connector";

/**
 * Maps one "vigente" (currently open for bidding) row from LicitIA's bulk
 * `/descargas/licitaciones/{lote}` dump into a Tender — see
 * discover-comprasmx-vigente.ts for the full flow this feeds.
 *
 * Deliberately the SAME slug scheme as compras-mx-open-tenders-mapper.ts /
 * compras-mx-contracts-mapper.ts (`comprasmx-${slugify(tenderNumber)}`), so
 * a procedure discovered here that was already ingested via the manual
 * "Difusión de procedimientos" export (or later shows up in an awarded-
 * contracts export) upserts the SAME row instead of creating a duplicate.
 * discover-comprasmx-vigente.ts additionally skips any tender_number
 * already in Supabase before even calling this, specifically so a manual
 * export's real Carácter/Tipo de contratación columns (which this source
 * doesn't have) never get overwritten by this source's coarser fields.
 *
 * Honest gaps versus the manual export mapper (real fields this bulk row
 * doesn't carry, confirmed against a real downloaded lote 2026-09-03):
 * - scopeType: no Adquisiciones/Servicios/Obra column here, only a
 *   procedure-type ("tipo": LICITACIÓN/INVITACIÓN/ADJUDICACIÓN) — defaults
 *   to "services", the same honest fallback
 *   compras-mx-open-tenders-mapper.ts uses for an unrecognized value.
 * - participationScope: no "Carácter del procedimiento" column — left
 *   undefined rather than guessed (matches inferParticipationScope's own
 *   "unrecognized value -> undefined" convention).
 * - location: "estado" here is ComprasMX's own numeric entidad-federativa
 *   code (confirmed via https://api.licitia.com.mx/api/open/v1/llms.txt:
 *   "la Ciudad de México es 7" — not INEGI's numbering), and there's no
 *   bundled name catalog for it yet — left unset instead of guessing a
 *   wrong state name.
 */

/**
 * A "real" acronym (SEDENA, IMSS, SICT...) is letters only. Confirmed real
 * (2026-09-03, procedure LO-73-R96-914004997-N-38-2026, Jalisco's own
 * infrastructure secretariat) that LicitIA's own `buyer.acronym` degrades
 * to a raw ramo+unidad-responsable code ("073R96") for a buyer without an
 * established short name — indistinguishable from a real acronym except
 * that it contains a digit, which no real Mexican government acronym does.
 */
const LOOKS_LIKE_RAW_CODE = /\d/;

/**
 * Prefers a clean acronym when the detail lookup found one; falls back to
 * the full agency name when the "acronym" is really just a raw code (see
 * LOOKS_LIKE_RAW_CODE above); falls back further to the bulk row's own
 * (possibly equally raw) siglas/dependencia if the detail lookup didn't
 * resolve at all (not_found/error — the row still gets ingested, just with
 * whatever the bulk dump itself carries).
 */
export function resolveBuyerName(row: LicitiaVigenteRow, detail?: { buyerAgency?: string; buyerAcronym?: string }): string | undefined {
  if (detail?.buyerAcronym && !LOOKS_LIKE_RAW_CODE.test(detail.buyerAcronym)) return detail.buyerAcronym;
  if (detail?.buyerAgency) return detail.buyerAgency;
  return (row.siglas || row.dependencia)?.trim();
}

function inferStatus(estatus: string): TenderStatus {
  const normalized = estatus.toUpperCase();
  if (normalized.includes("ACLARACION") || normalized.includes("PREGUNTA") || / JA$| JA /.test(normalized)) return "clarification";
  return "open";
}

function buildKeyDates(row: LicitiaVigenteRow, tenderNumber: string): TenderKeyDate[] {
  if (!row.apertura) return [];
  // Same reasoning as compras-mx-open-tenders-mapper.ts's buildKeyDates:
  // this source's one real date field ("apertura") is submission-and-
  // opening combined, not two separate events.
  return [
    { id: `${tenderNumber}-submission`, type: "submission", date: row.apertura },
    { id: `${tenderNumber}-opening`, type: "opening", date: row.apertura },
  ];
}

export function mapLicitiaVigenteRowToTender(
  row: LicitiaVigenteRow,
  sourceName: string,
  sourceUrl: string,
  detail?: { buyerAgency?: string; buyerAcronym?: string },
): Tender | null {
  const tenderNumber = row.numero?.trim().toUpperCase();
  const title = row.nombre?.trim();
  const buyer = resolveBuyerName(row, detail);
  if (!tenderNumber || !title || !buyer) return null;

  const industries = classifyIndustries(title, buyer);
  const scopeType = "services" as const;
  const now = new Date().toISOString();
  // Real publication date, unlike compras-mx-open-tenders-mapper.ts's
  // ingestion-timestamp placeholder — the manual export has no publication
  // column at all, this bulk row does ("publicacion").
  const publicationDate = row.publicacion ?? now;

  return {
    id: crypto.randomUUID(),
    slug: `comprasmx-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Mexico",
    governmentLevel: inferGovernmentLevelFromProcedureNumber(tenderNumber, buyer),
    industries,
    scopeType,
    procedureType: row.tipo?.trim() || "Unknown",
    participationScope: undefined,
    publicationDate,
    publicationDateIsEstimated: !row.publicacion,
    submissionDeadline: row.apertura ?? undefined,
    awardDate: row.fallo ?? undefined,
    status: inferStatus(row.estatus ?? ""),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(row, tenderNumber),
    risks: [],
    relevance: classifyRelevance({ title, industries, scopeType, buyer }),
    sourceName,
    sourceUrl,
    createdAt: now,
    updatedAt: now,
  };
}
