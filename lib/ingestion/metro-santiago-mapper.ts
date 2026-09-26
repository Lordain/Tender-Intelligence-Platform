import type { Tender, TenderScopeType } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { METRO_SANTIAGO_PREVIEW_SOURCE_NAME } from "@/lib/upcoming-tenders";
import { METRO_SANTIAGO_PREVIEW_URL, type MetroSantiagoPlannedTender } from "@/lib/ingestion/connectors/metro-santiago-live";

export { METRO_SANTIAGO_PREVIEW_SOURCE_NAME };

const METRO_BUYER = "Metro S.A. (Metro de Santiago)";

/**
 * The line-building projects: new lines (L7, L8, L9, L8-9 as "L89"), line
 * extensions ("L6EX EFE", "EL2-EL3") and any "Línea N" spelling. What the
 * user asked for (只保留新线路和大型系统) — the other project headings are
 * the running railway's own buying: Operacionales, Mantenimiento,
 * Corporativas, ET (IT), Existencias.
 */
const LINE_PROJECT = /^(?:l\s?\d{1,2}|l[íi]nea\s?\d{1,2}|l89|l6\s?ex|el\s?\d)/i;

/**
 * Line-project rows that are still not the large work: studies, inspection,
 * archaeology, training, licences, catering. What remains is works and the
 * systems a line is built from — track, catenary, rolling stock, CBTC,
 * ticketing, platform doors, electrical and communications systems.
 */
const NOT_LARGE_WORK = /\bing\.?\s|ingenier[íi]a|consultor[íi]a|asesor[íi]a|\bito\b|inspecci[óo]n t[ée]cnica|arqueol|paleontol|monitoreo|capacitaci|coffee|licencia|concepto de arquitectura|estudio/i;

function monthIndex(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return year * 12 + (month - 1);
}

function santiagoYearMonth(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

/**
 * Whether a row is a large line-building item whose planned month is still
 * ahead (Santiago time). Only a month not yet reached: once it arrives the
 * table cannot say whether the tender opened on Metro's gated portal, slipped
 * or was dropped (it is not pruned — 2022 rows are still listed), so the
 * preview comes down rather than keep saying 即将招标 on a guess (2026-09-26,
 * user: 不好判断，不要). The first run under this rule removed the four June–
 * August L7/L9 previews the earlier three-month grace had kept.
 */
export function isLargeUpcomingMetroItem(row: MetroSantiagoPlannedTender, now: Date = new Date()): boolean {
  if (!row.plannedMonth) return false;
  if (monthIndex(row.plannedMonth) <= monthIndex(santiagoYearMonth(now))) return false;
  return LINE_PROJECT.test(row.project.trim()) && !NOT_LARGE_WORK.test(row.service);
}

/** "L9" → "Línea 9", "L89" → "Líneas 8 y 9", "L6EX EFE" → "Extensión Línea 6"; anything else as written. */
export function metroLineLabel(project: string): string {
  const text = project.trim();
  if (/^l89$/i.test(text)) return "Líneas 8 y 9";
  const extension = /^l(\d{1,2})\s?ex/i.exec(text);
  if (extension) return `Extensión Línea ${extension[1]}`;
  const line = /^(?:l|l[íi]nea)\s?(\d{1,2})$/i.exec(text);
  if (line) return `Línea ${line[1]}`;
  return text;
}

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function monthName(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

function scopeOf(service: string): TenderScopeType {
  const works = /obras?\b|oo\.?\s?cc|construcci[óo]n|t[úu]nel|piques|galer[íi]as|estaciones|cocheras|talleres/i.test(service);
  const supply = /suministro|material rodante|cbtc|sistema|ticketing|puertas|\bv[íi]as\b|catenaria|comunicaci|comando|el[ée]ctric|luminaria|\bemas\b/i.test(service);
  if (works && supply) return "equipment_services";
  if (works) return "works";
  if (/mantenimiento|mantenci[óo]n/i.test(service)) return "equipment_services";
  return supply ? "equipment" : "works";
}

/** One programme row → a planned Tender; null for anything that is not a large, still-upcoming item. */
export function mapMetroSantiagoPlannedTender(row: MetroSantiagoPlannedTender, now: Date = new Date()): Tender | null {
  if (!isLargeUpcomingMetroItem(row, now) || !row.plannedMonth) return null;

  const line = metroLineLabel(row.project);
  const title = /metro/i.test(row.service) ? row.service : `${row.service} — Metro de Santiago, ${line}`;
  // Said in the text itself as well as by the 即将招标 status, so the notice
  // survives into translations, digests and search snippets.
  const summary = [
    `Próxima licitación (aviso previo) de Metro de Santiago, proyecto ${line}: ${row.service}.`,
    `Metro prevé publicarla en ${monthName(row.plannedMonth)}; la fecha es referencial y puede cambiar.`,
    "Aún no está abierta: las bases se publicarán en el portal de licitaciones de Metro, que exige la inscripción previa del proveedor.",
  ].join(" ");
  const scopeType = scopeOf(row.service);
  const procedureType = "Licitación pública (aviso previo — próxima licitación)";
  const tenderNumber = `METRO-SCL-${slugify(`${row.project}-${row.service}`).slice(0, 60).toUpperCase()}`;

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer: METRO_BUYER,
    country: "Chile",
    governmentLevel: "public_company",
    scopeType,
    procedureType,
    tenderNumber,
    sourceName: METRO_SANTIAGO_PREVIEW_SOURCE_NAME,
  });
  if (relevance.tier === "excluded") return null;

  const slug = `metro-santiago-${slugify(`${row.project}-${row.service}`).slice(0, 80)}`;
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer: METRO_BUYER,
    country: "Chile",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType,
    // The day the platform first saw the announcement: the table has no
    // publication date of its own, and upsert keeps an estimated date once
    // stored, so it settles instead of moving every night.
    publicationDate: timestamp,
    publicationDateIsEstimated: true,
    location: "Santiago, Región Metropolitana",
    status: "planned",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [],
    risks: [],
    relevance,
    sourceName: METRO_SANTIAGO_PREVIEW_SOURCE_NAME,
    sourceUrl: METRO_SANTIAGO_PREVIEW_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
