import type { Tender, TenderKeyDate } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";
import { inferGovernmentLevel, CFE_BUYER_PATTERN, CFE_MICROSITIO_URL } from "@/lib/ingestion/heuristics";
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

const SPANISH_MONTHS: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

/**
 * DOF's own detail-page date values come in at least two real shapes —
 * confirmed 2026-09-03 from two different CFE "Área Contratante" offices
 * generating their own convocatoria HTML: "11/09/2026, 10:30 hrs" (numeric,
 * CFE-0001-CAAAT-0134-2026) and "4 de septiembre de 2026 a las 10:00
 * horas" (written-out Spanish month name, CFE-0040-CAAAT-0004-2026) — the
 * first version of this function only handled the numeric shape, so every
 * date on the second office's notices silently failed to parse (returned
 * null) and got dropped rather than recorded with the wrong value —
 * caught by comparing that notice's real HTML side by side with the first.
 */
function parseDofDetailDate(raw: string | undefined): string | null {
  if (!raw) return null;

  const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*hrs)?/i);
  if (numeric) {
    const [, day, month, year, hour, minute] = numeric;
    const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${(hour ?? "00").padStart(2, "0")}:${minute ?? "00"}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const written = raw.match(/^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})(?:\s+a\s+las\s+(\d{1,2}):(\d{2})\s*horas)?/i);
  if (written) {
    const [, day, monthName, year, hour, minute] = written;
    const month = SPANISH_MONTHS[monthName.toLowerCase()];
    if (!month) return null;
    const parsed = new Date(`${year}-${month}-${day.padStart(2, "0")}T${(hour ?? "00").padStart(2, "0")}:${minute ?? "00"}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
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
    } else if (/visita en sitio/i.test(label)) {
      // Real label, third office (CFE-0400-CAAAT-0009-2026): "Visita en
      // sitio" — a real site-visit date this source never carried before.
      keyDates.push({ id: `${tenderNumber}-site-visit`, type: "site_visit", date: iso });
    } else if (/aclaraci[óo]n/i.test(label)) {
      // Same third office, real gap: "Aclaración a los documentos del
      // Concurso" (singular, written accent on the ó) — the old plain
      // "aclaracion" pattern only matched the accent-free plural
      // ("Sesión de Aclaraciones", first office) and silently dropped
      // this one's clarification date entirely.
      keyDates.push({ id: `${tenderNumber}-clarification`, type: "clarification", date: iso });
    } else if (/l[íi]mite.*ofertas|presentaci[óo]n.*ofertas/i.test(label)) {
      submissionDeadline = iso;
      keyDates.push({ id: `${tenderNumber}-submission`, type: "submission", date: iso });
    } else if (/apertura.*t[ée]cnica/i.test(label)) {
      // Real label variants: "Apertura Técnica" (first office) vs.
      // "Apertura de ofertas técnicas." (second office, "de ofertas"
      // inserted, trailing period) — .* bridges both.
      keyDates.push({ id: `${tenderNumber}-opening-tecnica`, type: "opening", date: iso });
    } else if (/apertura.*econ[óo]mica/i.test(label)) {
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
    // CFE tenders link to CFE's own micrositio instead of DOF (explicit
    // request, 2026-09-05 — see CFE_MICROSITIO_URL's own comment for why
    // it's a landing page, not a deep link). Every other DOF-sourced
    // buyer keeps the cross-referenced (not directly captured) DOF URL
    // pattern — see dof-mapper.ts's buildSourceUrl comment. Deliberately
    // no "www." (2026-09-03, real find): www.dof.gob.mx fails TLS/SNI
    // verification for at least one real user ("SEC_E_WRONG_PRINCIPAL")
    // while the bare domain works fine — the same bare host every real
    // fetch in this codebase (dof-notice-detail.ts included) already uses.
    sourceUrl: CFE_BUYER_PATTERN.test(buyer) ? CFE_MICROSITIO_URL : `https://dof.gob.mx/nota_detalle.php?codigo=${nota.codNota}`,
    createdAt: now,
    updatedAt: now,
  };
}
