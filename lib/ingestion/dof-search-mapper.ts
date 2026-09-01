import type { Tender } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";

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
  return { buyer: match[1].trim(), ref: match[2] };
}

function parseFecha(raw: string): string | null {
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function mapDofSearchNotaToTender(nota: DofSearchNota, sourceName: string): Tender | null {
  const title = nota.titulo?.trim();
  if (!title || !TENDER_SECTION.test(nota.codOrgaUno ?? "")) return null;

  const publicationDate = parseFecha(nota.fecha);
  if (!publicationDate) return null;

  const { buyer: parsedBuyer, ref } = parseBuyerAndRef(title);
  const buyer = parsedBuyer ?? nota.codOrgaDos ?? "Desconocido";
  const now = new Date().toISOString();
  const industry = "General";
  const scopeType = "services" as const;

  return {
    id: crypto.randomUUID(),
    slug: `dof-${slugify(String(nota.codNota))}`,
    tenderNumber: ref ? `DOF-REF-${ref}` : `DOF-${nota.codNota}`,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Mexico",
    governmentLevel: "federal",
    industry,
    scopeType,
    procedureType: "Convocatoria (DOF)",
    publicationDate,
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [{ id: `dof-${nota.codNota}-publication`, type: "publication", date: publicationDate }],
    risks: [],
    relevance: classifyRelevance({ title, industry, scopeType }),
    sourceName,
    // Same cross-referenced (not directly captured) URL pattern as
    // dof-mapper.ts — see that file's buildSourceUrl comment.
    sourceUrl: `https://www.dof.gob.mx/nota_detalle.php?codigo=${nota.codNota}`,
    createdAt: now,
    updatedAt: now,
  };
}
