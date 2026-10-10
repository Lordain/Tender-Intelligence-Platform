import type { GovernmentLevel, Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { zonedIso } from "@/lib/ingestion/worldbank-mapper";
import { convocatoriaDate, proinversionAppDetailUrl, type ProinversionAppProject, type ScheduleStep } from "@/lib/ingestion/connectors/peru-proinversion-app-live";

/**
 * One ProInversión APP project whose concurso has been called → a Tender.
 * See connectors/peru-proinversion-app-live.ts. The general relevance rules
 * apply; every project states its investment.
 */

export const PROINVERSION_APP_SOURCE_NAME = "ProInversión — Proyectos APP en concurso (Perú)";

const LIMA = "America/Lima";
const PROINVERSION = "Agencia de Promoción de la Inversión Privada (ProInversión)";

/** The phase a called concurso is in, and the state that says it is not over. */
export function isAppConcursoUnderWay(project: ProinversionAppProject): boolean {
  return project.Fase === "Transacción" && !/adjudicad|concluid|desierto|cancelad|suspendid/i.test(project.Estado);
}

/** "AGENCIA DE PROMOCIÓN DE LA INVERSIÓN PRIVADA" → ProInversión's own name; anyone else in title case. */
function buyerOf(titular: string): string {
  if (/promoci[oó]n de la inversi[oó]n privada/i.test(titular)) return PROINVERSION;
  const name = titular
    .toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|E|En|Para)\b/g, (word) => word.toLowerCase());
  return `${name} (con ProInversión)`;
}

function governmentLevelOf(titular: string): GovernmentLevel {
  if (/gobierno regional/i.test(titular)) return "state";
  if (/municipalidad/i.test(titular)) return "municipal";
  return "federal";
}

function scopeOf(project: ProinversionAppProject): TenderScopeType {
  // An operation-and-maintenance concession builds nothing new; the rest of
  // the portfolio is design-build-operate.
  return /operaci[oó]n y mantenimiento/i.test(`${project.NombreCorto} ${project.ModalidadContractual}`) ? "services" : "works";
}

/** Called and still under way → a Tender; null otherwise (no call date, or awarded). */
export function mapAppProjectToTender(project: ProinversionAppProject, schedule: ScheduleStep[], now: Date = new Date()): Tender | null {
  if (!isAppConcursoUnderWay(project)) return null;
  const calledOn = convocatoriaDate(schedule);
  if (!calledOn) return null;

  const slug = `peru-proinversion-app-${project.Slug.replace(/^\d+-/, "")}`.toLowerCase();
  const tenderNumber = `PROINVERSION-APP-${project.Id}`;
  const title = project.NombreCorto.trim() || project.Nombre.trim();
  const buyer = buyerOf(project.Titular);
  const governmentLevel = governmentLevelOf(project.Titular);
  const scopeType = scopeOf(project);
  const amount = project.MontoInversionSIGV && project.MontoInversionSIGV > 0 ? Math.round(project.MontoInversionSIGV * 1_000_000) : undefined;
  const procedureType = `Concurso público internacional — Asociación Público Privada (${[project.Modalidad, project.ModalidadContractual].filter(Boolean).join(", ")})`;
  const award = schedule.find((step) => /^buena pro/i.test(step.step))?.when ?? project.BuenaProPrevista;
  const summary = [
    project.Nombre.trim() !== title ? `${project.Nombre.trim()}.` : undefined,
    `Proyecto APP de ProInversión, sector ${project.Sector.toLowerCase()}, en fase de Transacción: concurso convocado el ${calledOn.split("-").reverse().join("/")}.`,
    amount ? `Inversión estimada (sin IGV): US$ ${project.MontoInversionSIGV} millones.` : undefined,
    project.AnhoConcesion ? `Plazo de la concesión: ${project.AnhoConcesion} años.` : undefined,
    award ? `Buena pro prevista: ${award}.` : undefined,
    "ProInversión no publica aquí la fecha límite de las ofertas: las bases y sus circulares fijan el cronograma, incluido hasta cuándo se puede adquirir el derecho de participación y presentar credenciales.",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: "Peru",
    governmentLevel,
    scopeType,
    ...(amount ? { estimatedValue: amount, currency: "USD" } : {}),
    procedureType,
    tenderNumber,
    sourceName: PROINVERSION_APP_SOURCE_NAME,
  });

  const publicationDate = zonedIso(calledOn, "12:00", LIMA)!;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Peru",
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    participationScope: "international_open",
    ...(amount ? { estimatedValue: amount, currency: "USD" } : {}),
    publicationDate,
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: PROINVERSION_APP_SOURCE_NAME,
    sourceUrl: proinversionAppDetailUrl(project.Slug),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
