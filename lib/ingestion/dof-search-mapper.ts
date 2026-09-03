import type { Tender, TenderKeyDate } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";
import { inferGovernmentLevel } from "@/lib/ingestion/heuristics";
import type { DofNoticeDetail } from "@/lib/ingestion/connectors/dof-notice-detail";

/**
 * One "nota" from DOF's advanced-search endpoint
 * (`sidof.segob.gob.mx/busqueda/CargaNotasAvanzadas/`), confirmed against
 * a real captured response — NOT the same field semantics as
 * `dof-mapper.ts`'s `DofNota` (the daily-edition endpoint): there,
 * `codOrgaUno` is a short branch-of-government code (PE/PJ/OA/...) and
 * `codOrgaDos` is the publishing department; here, `codOrgaUno` instead
 * carries either the branch's full name ("PODER EJECUTIVO",
 * "EMPRESAS PUBLICAS DEL ESTADO MEXICANO") or, for tender notices
 * specifically, the literal DOF section name
 * "CONVOCATORIAS PARA CONCURSOS DE ADQUISICIONES, ARRENDAMIENTOS, OBRAS Y
 * SERVICIOS DEL SECTOR PUBLICO" — confirmed real by a captured search for
 * "Comisión Federal de Electricidad" that returned CFE tender notices
 * filed exactly under that section, proving CFE tenders DO appear in DOF
 * (closing the question this whole connector exists to answer). Buyer
 * name lives in the title as "<BUYER> - REF:<number>", not in a
 * dedicated field, for these.
 *
 * Unlike the Compras MX search API, this endpoint carries NO anti-bot
 * headers (grc/igrc/xgrc) — just a standard `ci_session` cookie, the
 * routine session cookie any visitor gets, not a deliberate
 * anti-automation challenge. Still read from a locally-saved response
 * here (not fetched live) since this session can't reach *.gob.mx to
 * verify a live fetch actually works end-to-end — see README.md.
 */
export type DofSearchNota = {
  codNota: number;
  titulo?: string;
  fecha: string; // "yyyy/mm/dd"
  codDiario: number;
  codOrgaUno?: string | null;
  codOrgaDos?: string | null;
};

const TENDER_SECTION = /CONVOCATORIAS PARA CONCURSOS/i;

/** "COMISION FEDERAL DE ELECTRICIDAD - REF:579845" -> { buyer: "COMISION FEDERAL DE ELECTRICIDAD", ref: "579845" } */
function parseBuyerAndRef(titulo: string): { buyer?: string; ref?: string } {
  const match = titulo.match(/^(.+?)\s*-\s*REF:\s*(\d+)/i);
  if (!match) return {};
  let buyer = match[1].trim();

  // Some real titles prefix a short internal unit code before the actual
  // buyer name — confirmed real: "018T0O - INSTITUTO MEXICANO DEL
  // PETROLEO - REF:579186" (older notices for the same buyer, e.g.
  // "INSTITUTO MEXICANO DEL PETROLEO - REF:573547", have no such prefix).
  // Strip it only when it looks like a code (short, no lowercase letters
  // or spaces) rather than blindly taking everything before the first
  // "-", since some real buyer names legitimately contain their own dash
  // (e.g. "COMISION FEDERAL DE ELECTRICIDAD A RUEGO Y ENCARGO").
  const codePrefix = buyer.match(/^[A-Z0-9]{4,8}\s*-\s*(.+)$/);
  if (codePrefix) buyer = codePrefix[1].trim();

  return { buyer, ref: match[2] };
}

function parseFecha(raw: string): string | null {
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Converts a search result's "YYYY/MM/DD" fecha into the detail page's own "DD/MM/YYYY" URL format — confirmed real (2026-09-03) both are DOF's own, just different endpoints with different conventions. */
export function toDetailPageFecha(searchFecha: string): string | null {
  const match = searchFecha.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

/**
 * DOF's own detail-page date values, e.g. "11/09/2026, 10:30 hrs" or just
 * "27/08/2026" with no time — confirmed real 2026-09-03 (both shapes seen
 * in the same table, CFE-0001-CAAAT-0134-2026's "Fecha de publicación en
 * Micrositio" has no time, every other row does).
 */
function parseDofDetailDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*hrs)?/i);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${(hour ?? "00").padStart(2, "0")}:${minute ?? "00"}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Maps the detail page's real field-label table (see dof-notice-detail.ts)
 * into keyDates + submissionDeadline + a real publication date — labels
 * confirmed real for CFE-0001-CAAAT-0134-2026 only so far; a label none of
 * these patterns match is silently skipped (not fabricated into a wrong
 * type), so a differently-worded notice degrades gracefully to "fewer key
 * dates" rather than a wrong one.
 */
function buildDofDetailFields(fieldsByLabel: Record<string, string>, tenderNumber: string) {
  const keyDates: TenderKeyDate[] = [];
  let submissionDeadline: string | undefined;
  let publicationDate: string | undefined;

  for (const [label, rawValue] of Object.entries(fieldsByLabel)) {
    const iso = parseDofDetailDate(rawValue);
    if (!iso) continue;

    if (/publicaci[óo]n/i.test(label)) {
      publicationDate = iso;
    } else if (/aclaracion/i.test(label)) {
      keyDates.push({ id: `${tenderNumber}-clarification`, type: "clarification", date: iso });
    } else if (/l[íi]mite.*ofertas|presentaci[óo]n.*ofertas/i.test(label)) {
      submissionDeadline = iso;
      keyDates.push({ id: `${tenderNumber}-submission`, type: "submission", date: iso });
    } else if (/apertura t[ée]cnica/i.test(label)) {
      keyDates.push({ id: `${tenderNumber}-opening-tecnica`, type: "opening", date: iso });
    } else if (/apertura econ[óo]mica/i.test(label)) {
      keyDates.push({ id: `${tenderNumber}-opening-economica`, type: "opening", date: iso });
    } else if (/^fallo/i.test(label)) {
      keyDates.push({ id: `${tenderNumber}-award`, type: "award", date: iso });
    }
  }

  return { keyDates, submissionDeadline, publicationDate };
}

/**
 * `detail`, when present, is the notice's own detail page content (see
 * dof-notice-detail.ts) — real procedure number, real title, and a real
 * key-dates table, replacing the search endpoint's bare "<BUYER> -
 * REF:<number>" stub (see lib/relevance.ts's BARE_BUYER_REF_TITLE — a row
 * with no detail still maps exactly as before, and still gets excluded
 * for having no real content, which is honest: there genuinely is none).
 */
export function mapDofSearchNotaToTender(nota: DofSearchNota, sourceName: string, detail?: DofNoticeDetail): Tender | null {
  const stubTitle = nota.titulo?.trim();
  if (!stubTitle || !TENDER_SECTION.test(nota.codOrgaUno ?? "")) return null;

  const searchDate = parseFecha(nota.fecha);
  if (!searchDate) return null;

  const { buyer: parsedBuyer, ref } = parseBuyerAndRef(stubTitle);
  const buyer = parsedBuyer ?? nota.codOrgaDos ?? "Desconocido";

  const tenderNumber = detail?.procedureNumber?.trim() || (ref ? `DOF-REF-${ref}` : `DOF-${nota.codNota}`);
  const title = detail?.title?.trim() || stubTitle;

  const { keyDates: detailKeyDates, submissionDeadline, publicationDate: detailPublicationDate } = detail
    ? buildDofDetailFields(detail.fieldsByLabel, tenderNumber)
    : { keyDates: [] as TenderKeyDate[], submissionDeadline: undefined, publicationDate: undefined };

  const publicationDate = detailPublicationDate ?? searchDate;
  const now = new Date().toISOString();
  const industries = classifyIndustries(title, buyer);
  const scopeType = "services" as const;

  return {
    id: crypto.randomUUID(),
    slug: `dof-${slugify(String(nota.codNota))}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Mexico",
    // CFE/PEMEX are constitutionally distinct "Empresas Productivas del
    // Estado", not federal ministries (see pemex-mapper.ts) — this used
    // to be hardcoded "federal" for every DOF row regardless of buyer;
    // inferGovernmentLevel() already recognizes CFE/PEMEX by name.
    governmentLevel: inferGovernmentLevel(buyer),
    industries,
    scopeType,
    procedureType: "Convocatoria (DOF)",
    publicationDate,
    submissionDeadline,
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: detailKeyDates.length > 0 ? detailKeyDates : [{ id: `dof-${nota.codNota}-publication`, type: "publication", date: publicationDate }],
    risks: [],
    relevance: classifyRelevance({ title, industries, scopeType, buyer }),
    sourceName,
    // Same cross-referenced (not directly captured) URL pattern as
    // dof-mapper.ts — see that file's buildSourceUrl comment.
    sourceUrl: `https://www.dof.gob.mx/nota_detalle.php?codigo=${nota.codNota}`,
    createdAt: now,
    updatedAt: now,
  };
}
