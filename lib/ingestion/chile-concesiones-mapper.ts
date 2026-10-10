import type { Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { CHILE_CONCESIONES_SOURCE_NAME } from "@/lib/relevance-chile-concesiones";
import type { ConcesionProject } from "@/lib/ingestion/connectors/chile-concesiones-live";
import { zonedIso } from "@/lib/ingestion/worldbank-mapper";

/**
 * One concession on the MOP's "Proyectos en Licitación" page → a Tender.
 * See connectors/chile-concesiones-live.ts for the source and
 * lib/relevance-chile-concesiones.ts for how each is sized.
 */

export { CHILE_CONCESIONES_SOURCE_NAME };

const BUYER = "Ministerio de Obras Públicas — Dirección General de Concesiones (DGC)";
const PROCEDURE_TYPE = "Licitación pública internacional — concesión de obra pública (Ley de Concesiones, DS MOP 900)";

/**
 * The page states the day, not the hour. Read in Santiago's own zone (UTC-3
 * from September to April, UTC-4 otherwise), so a December deadline is
 * 23:59 on the stated day rather than 00:59 the next.
 */
const SANTIAGO = "America/Santiago";
const endOfDay = (day: string) => zonedIso(day, "23:59", SANTIAGO)!;
const midday = (day: string) => zonedIso(day, "12:00", SANTIAGO)!;

/**
 * The official budget: "UF 26.535.000" → 26,535,000 UF; "MM USD 946,2 (UF
 * 23.893.000)" → the UF figure, which is the one the bases fix; "MM USD 113"
 * → 113,000,000 US$. Chilean separators: "." for thousands, "," for decimals.
 */
export function concesionBudget(text: string | undefined): { value: number; currency: string } | undefined {
  if (!text) return undefined;
  const number = (raw: string) => Number(raw.replace(/\./g, "").replace(",", "."));
  const uf = /\bUF\s*([\d.]+(?:,\d+)?)/i.exec(text);
  if (uf && number(uf[1]) > 0) return { value: number(uf[1]), currency: "UF" };
  const usd = /\bMM\s*US\$?D?\s*([\d.]+(?:,\d+)?)/i.exec(text);
  if (usd && number(usd[1]) > 0) return { value: Math.round(number(usd[1]) * 1_000_000), currency: "USD" };
  return undefined;
}

/** The project's path name: ".../project/accesos-a-valdivia/" → "accesos-a-valdivia". */
export function concesionKey(project: Pick<ConcesionProject, "url" | "name">): string {
  return /\/project\/([^/]+)/.exec(project.url)?.[1] ?? slugify(project.name);
}

function scopeOf(project: ConcesionProject): TenderScopeType {
  // A warning network is installed equipment that the concessionaire runs;
  // everything else on the page is a road, a cable car or a building.
  return /\bsistema\b|alerta temprana|equipamiento/i.test(project.name) ? "equipment_services" : "works";
}

function location(project: ConcesionProject): string | undefined {
  if (!project.region || /territorio nacional/i.test(project.region)) return project.region ? "Chile (cobertura nacional)" : undefined;
  return project.comuna ? `${project.comuna} — Región de ${project.region}` : `Región de ${project.region}`;
}

/** Documents worth a bidder's download: not the list of companies that bought the bases. */
export function concesionDocumentLinks(project: ConcesionProject): TenderDocumentLink[] {
  return project.documents
    .filter((doc) => !/empresas que han comprado/i.test(doc.name))
    .map((doc) => ({
      sourceUrl: doc.url,
      fileName: safeFileName(/\.(pdf|zip|docx?|xlsx?)$/i.test(doc.url) ? decodeURIComponent(doc.url.split("/").pop() ?? doc.name) : `${doc.name}.pdf`),
      documentType: doc.name,
      format: (/\.([a-z0-9]+)$/i.exec(doc.url)?.[1] ?? "pdf").toLowerCase(),
    }));
}

/** One project → a Tender; null when it has no bid date or its offers are already in (`today`, YYYY-MM-DD, Santiago). */
export function mapConcesionToTender(project: ConcesionProject, today: string, now: Date = new Date()): Tender | null {
  if (!project.offersDue || project.offersDue < today) return null;

  const key = concesionKey(project);
  const slug = `chile-concesion-${slugify(key)}`;
  const tenderNumber = `DGC-${key.toUpperCase()}`;
  const budget = concesionBudget(project.budgetText);
  const scopeType = scopeOf(project);
  const notes = project.dateNotes.length > 0 ? ` (${project.dateNotes.join("; ")})` : "";
  const summary = [
    project.description,
    `Concesión de obra pública licitada por la Dirección General de Concesiones del MOP (${project.category}).`,
    project.volume ? `Extensión o superficie: ${project.volume}.` : undefined,
    project.budgetText ? `Presupuesto oficial: ${project.budgetText}.` : undefined,
    `Recepción de ofertas técnicas y económicas: ${project.offersDue}${notes}.`,
    project.economicOpening ? `Apertura de ofertas económicas: ${project.economicOpening}.` : undefined,
    project.initiative ? `Iniciativa ${project.initiative.toLowerCase()}.` : undefined,
    "Para ofertar se deben adquirir las bases de licitación en la Dirección General de Concesiones.",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title: project.name,
    summary,
    buyer: BUYER,
    country: "Chile",
    governmentLevel: "federal",
    scopeType,
    ...(budget ? { estimatedValue: budget.value, currency: budget.currency } : {}),
    procedureType: PROCEDURE_TYPE,
    tenderNumber,
    sourceName: CHILE_CONCESIONES_SOURCE_NAME,
  });

  const publicationDate = project.calledOn ? midday(project.calledOn) : now.toISOString();
  const submissionDeadline = endOfDay(project.offersDue);
  const keyDates: TenderKeyDate[] = [
    { id: `${slug}-publication`, type: "publication", date: publicationDate },
    { id: `${slug}-submission`, type: "submission", date: submissionDeadline },
  ];
  if (project.economicOpening) keyDates.push({ id: `${slug}-opening`, type: "opening", date: midday(project.economicOpening), notes: { es: "Apertura de ofertas económicas", en: "Economic offers opened", zh: "开启经济标" } });
  const where = location(project);
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(project.name),
    summary: untranslated(summary),
    buyer: BUYER,
    country: "Chile",
    governmentLevel: "federal",
    industries,
    scopeType,
    procedureType: PROCEDURE_TYPE,
    participationScope: "international_open",
    ...(budget ? { estimatedValue: budget.value, currency: budget.currency } : {}),
    publicationDate,
    ...(project.calledOn ? {} : { publicationDateIsEstimated: true }),
    submissionDeadline,
    ...(where ? { location: where } : {}),
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: CHILE_CONCESIONES_SOURCE_NAME,
    sourceUrl: project.url,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
