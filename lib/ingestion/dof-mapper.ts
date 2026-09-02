import type { Tender, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";

/**
 * One "nota" (notice) from a real DOF (Diario Oficial de la Federación)
 * daily-edition API response, confirmed against real captured JSON the
 * user provided (latin-1 encoded — decoded and re-verified, not GB18030
 * like the Compras MX exports). DOF is a general federal gazette (laws,
 * decrees, notices — tender announcements are one category among many),
 * so this mapper is deliberately light: title/date/buyer/page only, no
 * value/deadline/scope the way Compras MX's summary exports have. See
 * README.md "Why DOF isn't built yet" for the fuller picture.
 */
export type DofNota = {
  codNota: number;
  titulo?: string;
  codSeccion?: string;
  fecha: string; // "dd-mm-yyyy"
  codDiario: number;
  existeHtml?: "S" | "N";
  existeDoc?: "S" | "N";
  tipoNota?: string;
  pagina?: number;
  nombreCodOrgaUno?: string;
  codOrgaUno?: string;
  codOrgaDos?: string;
};

/**
 * Confirmed real 95-notice daily sample: exactly 1 in 95 notices is
 * tender-related — DOF is a general gazette, not a procurement platform,
 * so most days will look like this. Broader than Compras MX's own
 * keywords since DOF's procedure-type vocabulary isn't confirmed the same
 * way (LOPSRM/LAASSP-specific terms aren't guaranteed here).
 */
const TENDER_TITLE_KEYWORDS = /licitaci[óo]n|convocatoria|invitaci[óo]n a (cuando menos tres personas|instituciones)|concurso p[úu]blico/i;

export function isTenderNotice(titulo: string | undefined): boolean {
  return !!titulo && TENDER_TITLE_KEYWORDS.test(titulo);
}

function parseDofDate(raw: string): string | null {
  const match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * `dof.gob.mx/nota_detalle.php?codigo=<id>&fecha=<dd/mm/yyyy>` — the
 * `codigo` param name is cross-referenced from a real DOF URL found
 * independently (a citation for CFE's Disposiciones Generales, in a
 * different research pass) using the same on-domain notice-ID concept as
 * `codNota` here, not captured directly for this exact endpoint. Treat as
 * a strong inference, not a directly verified link, until someone
 * actually opens one.
 */
function buildSourceUrl(nota: DofNota): string {
  const [, day, month, year] = nota.fecha.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/) ?? [];
  const dofDate = day && month && year ? `${day}/${month}/${year}` : nota.fecha;
  return `https://www.dof.gob.mx/nota_detalle.php?codigo=${nota.codNota}&fecha=${encodeURIComponent(dofDate)}`;
}

export function mapDofNotaToTender(nota: DofNota, sourceName: string): Tender | null {
  const title = nota.titulo?.trim();
  if (!title || !isTenderNotice(title)) return null;

  const publicationDate = parseDofDate(nota.fecha);
  if (!publicationDate) return null;

  const buyer = nota.nombreCodOrgaUno && nota.codOrgaDos
    ? `${nota.nombreCodOrgaUno} — ${nota.codOrgaDos}`
    : nota.codOrgaDos ?? nota.nombreCodOrgaUno ?? "Desconocido";

  const now = new Date().toISOString();
  const industries = classifyIndustries(title, buyer);
  const scopeType = "services" as const;
  // DOF is a publication record, not a live bidding-status feed — a
  // notice that was JUST published is presumptively still within its
  // bidding window, same reasoning as compras-mx-open-tenders-mapper.ts's
  // "unrecognized status defaults to open" — but unlike that source, this
  // one carries no explicit status field at all, so this is a weaker
  // assumption and should be revisited once real Compras MX
  // cross-reference for the same tender number becomes available.
  const status: TenderStatus = "open";

  return {
    id: crypto.randomUUID(),
    slug: `dof-${slugify(String(nota.codNota))}`,
    tenderNumber: `DOF-${nota.codNota}`,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Mexico",
    // DOF is the FEDERAL gazette — every notice it publishes is federal
    // government-level by construction, not inferred from buyer name.
    governmentLevel: "federal",
    industries,
    scopeType,
    procedureType: nota.tipoNota && nota.tipoNota !== "null" ? nota.tipoNota : "Unknown",
    publicationDate,
    location: undefined,
    status,
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [{ id: `dof-${nota.codNota}-publication`, type: "publication", date: publicationDate }],
    risks: [],
    relevance: classifyRelevance({ title, industries, scopeType, buyer }),
    sourceName,
    sourceUrl: buildSourceUrl(nota),
    createdAt: now,
    updatedAt: now,
  };
}
