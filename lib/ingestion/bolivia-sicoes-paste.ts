import type { GovernmentLevel, Tender, TenderKeyDate, TenderParticipationScope, TenderScopeType, TenderStatus } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * Bolivia's SICOES (sicoes.gob.bo), a process's 「Ficha del proceso」 pasted
 * by hand (user, 2026-10-09: 请同步开始评估+做玻利维亚的接入 → 用第2个, the
 * web page, not the printable report).
 *
 * Why a paste and not a connector: SICOES sits behind Cloudflare Turnstile,
 * its search shuffles the result columns with a script and has an image
 * CAPTCHA, none of which this project gets around. The admin searches SICOES
 * in their own browser (Licitación Pública, Vigente, amount from Bs 7M),
 * opens 「Ver Ficha」 and pastes the page. The search list itself shows no
 * amount, so it is not read.
 *
 * The page as the browser copies it: numbered sections (「1. IDENTIFICACIÓN
 * DE LA ENTIDAD」 …), most fields as "Label<TAB>", ":" and the value on
 * three lines; a few as a header row and a value row; the reference prices
 * ending in 「TOTAL: <in words><TAB>5,741,536.00」; and 「9. PROGRAMACIÓN DEL
 * CRONOGRAMA DE ACTIVIDADES」 as "n<TAB>Actividad<TAB>dd/mm/yyyy<TAB>hh:mm" rows.
 * Several pages can be pasted one after another.
 *
 * Sections are told apart by their title, not their number: a process with
 * an external financier (ENDE's World Bank works, 26-0514-00-1695257-1-1)
 * numbers them differently. The budget certificate (it names whoever
 * requested it), the entity's bank account and beneficiary, its staff by
 * name, the documents' uploader and who published the page are never read:
 * nothing here keeps a person's name, and the bank account is no use to a
 * bidder on this platform.
 *
 * Times are Bolivia's, UTC-4 all year. Amounts are in the process's currency
 * (「Moneda considerada para el proceso」, nearly always Bolivianos).
 */

export const BOLIVIA = "Bolivia";
export const BOLIVIA_SICOES_SOURCE_NAME = "SICOES — Sistema de Contrataciones Estatales (Bolivia)";
export const BOLIVIA_SICOES_SEARCH_URL = "https://www.sicoes.gob.bo/portal/index.php";
const BOLIVIA_OFFSET = "-04:00";

/** A SICOES CUCE: 26-1704-00-1694954-1-1 (year, entity, process, convocatoria …). */
const CUCE = /\b\d{2}-\d{4}-\d{2}-\d{5,8}-\d+-[0-9A-Z]+\b/;
const PAGE_START = /^\s*1\.\s*IDENTIFICACI[ÓO]N DE LA ENTIDAD\s*$/i;
const SECTION = /^\s*\d{1,2}\.\s+[A-ZÁÉÍÓÚÑ]/;

/** Folds accents and case, for matching labels. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clean(text: string | undefined): string | undefined {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value : undefined;
}

/** "03/11/2026" and "10:00" (Bolivia time) → ISO, UTC. No time: noon, so the day survives any time zone. */
export function boliviaTime(date: string | undefined, time?: string): string | undefined {
  const match = date?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const clock = time?.match(/^(\d{2}):(\d{2})$/) ? time : "12:00";
  const parsed = new Date(`${match[3]}-${match[2]}-${match[1]}T${clock}:00${BOLIVIA_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** "5,741,536.00" (the web page) or "5.741.536,00" → 5741536. The separator followed by exactly two digits at the end is the decimal one. */
export function boliviaAmount(text: string | undefined): number | undefined {
  const raw = text?.replace(/\s/g, "").match(/\d[\d.,]*/)?.[0];
  if (!raw) return undefined;
  const decimal = raw.match(/[.,](\d{2})$/);
  const whole = (decimal ? raw.slice(0, -3) : raw).replace(/[.,]/g, "");
  const value = Number(decimal ? `${whole}.${decimal[1]}` : whole);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** SICOES's 「Tipo de contratación」: Bienes, Obras, Servicios Generales, Consultoría … */
export function boliviaScopeType(tipo: string | undefined): TenderScopeType {
  const value = fold(tipo ?? "");
  if (value.startsWith("bienes") && value.includes("servicio")) return "equipment_services";
  if (value.startsWith("bien")) return "equipment";
  if (value.startsWith("obra")) return "works";
  if (value.startsWith("consultor")) return "consulting";
  if (value.startsWith("servicio")) return "services";
  return "unknown";
}

export function boliviaGovernmentLevel(entity: string): GovernmentLevel {
  const value = fold(entity);
  // First: the state's companies (YPFB, ENDE, COMIBOL, Empresa Minera Huanuni …).
  if (/^empresa\b|\bempresa (publica|nacional|minera|estatal)|yacimientos petroliferos|\bypfb\b|\bende\b|corporacion minera|\bcomibol\b|boliviana de aviacion|\bentel\b|mi teleferico/.test(value)) return "public_company";
  if (/gobierno autonomo departamental|\bdepartamental\b|\bgobernacion\b/.test(value)) return "state";
  if (/gobierno autonomo municipal|\bmunicipal\b|\bmunicipio\b|indigena originario campesino/.test(value)) return "municipal";
  return "federal";
}

/** 「Tipo de convocatoria」: Convocatoria Publica Nacional / Internacional. */
export function boliviaParticipationScope(tipoConvocatoria: string | undefined): TenderParticipationScope {
  return /internacional/.test(fold(tipoConvocatoria ?? "")) ? "international_open" : "national";
}

/** The page shows no status; a call whose bid date has passed is no longer taking bids. */
export function boliviaStatus(deadline: string | undefined, now: Date): TenderStatus {
  if (deadline && Date.parse(deadline) < now.getTime()) return "submission_closed";
  return "open";
}

export type SicoesActivity = { name: string; date: string };

export type SicoesProcess = {
  cuce: string;
  /** Folded label → value, from the "Label / : / value" fields. */
  fields: Record<string, string>;
  entity?: string;
  modality?: string;
  /** The entity's own process code, e.g. GAMLG-LP-O N° 05/2026. */
  entityCode?: string;
  total?: number;
  /** 「PROGRAMACIÓN DEL CRONOGRAMA DE ACTIVIDADES」, in order. */
  activities: SicoesActivity[];
  /** 「FUENTES Y ORGANISMOS FINANCIADORES」's lenders, e.g. Banco Internacional de Reconstrucción y Fomento. */
  financiers: string[];
};

/** Sections whose content is never read (see the header comment), by title. */
const SKIPPED_SECTION = /DOCUMENTOS PREVENTIVOS|CUENTA BANCARIA|BENEFICIARIO|PERSONAL DE LA ENTIDAD|DOCUMENTOS PUBLICADOS|RESPONSABLE DE REGISTRO/i;
const SCHEDULE_SECTION = /CRONOGRAMA/i;
const FINANCING_SECTION = /FUENTES Y ORGANISMOS/i;

function splitPages(text: string): string[][] {
  const pages: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (PAGE_START.test(line) || pages.length === 0) pages.push([]);
    pages[pages.length - 1].push(line);
  }
  return pages;
}

function parsePage(lines: string[]): SicoesProcess | undefined {
  const fields: Record<string, string> = {};
  const activities: SicoesActivity[] = [];
  let entity: string | undefined;
  let modality: string | undefined;
  let entityCode: string | undefined;
  let total: number | undefined;
  const financiers: string[] = [];
  let skipping = false;
  let inSchedule = false;
  let inFinancing = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (SECTION.test(line)) {
      skipping = SKIPPED_SECTION.test(line);
      inSchedule = SCHEDULE_SECTION.test(line);
      inFinancing = FINANCING_SECTION.test(line);
      continue;
    }
    if (skipping) continue;

    if (/^\s*C[óo]digo de la Entidad\t/i.test(line)) {
      entity = clean(lines[index + 1]?.split("\t")[1]);
      index += 1;
      continue;
    }
    if (/^\s*Modalidad\t/i.test(line)) {
      const [mod, code] = (lines[index + 1] ?? "").split("\t");
      modality = clean(mod);
      entityCode = clean(code);
      index += 1;
      continue;
    }
    if (/^\s*TOTAL:/i.test(line)) {
      total = boliviaAmount(line.split("\t").pop());
      continue;
    }
    if (inFinancing) {
      // "1<TAB>43<TAB>Transferencias de Crédito Externo<TAB>412<TAB>Banco Internacional …<TAB>100"
      const columns = line.split("\t").map((column) => column.trim());
      const organism = /^\d+$/.test(columns[0] ?? "") ? clean(columns[4]) : undefined;
      if (organism && !financiers.includes(organism)) financiers.push(organism);
      continue;
    }
    if (inSchedule) {
      const row = line.match(/^\s*\d{1,2}\t([^\t]+)\t(\d{2}\/\d{2}\/\d{4})\t?(\d{2}:\d{2})?/);
      const iso = row && boliviaTime(row[2], row[3]);
      if (row && iso) activities.push({ name: row[1].replace(/\((fecha|fecha fija|fecha maxima|fecha máxima)[^)]*\)/i, "").trim(), date: iso });
      continue;
    }
    // "Label<TAB>" / ":" / value — the value runs until the next label or section.
    if (lines[index + 1]?.trim() === ":") {
      const label = fold(line.replace(/[\t:]+$/, ""));
      const values: string[] = [];
      let next = index + 2;
      for (; next < lines.length; next += 1) {
        const candidate = lines[next];
        if (SECTION.test(candidate) || lines[next + 1]?.trim() === ":" || /^\s*Modalidad\t/i.test(candidate)) break;
        if (candidate.trim()) values.push(candidate.trim());
      }
      const value = clean(values.join(" · "));
      if (value && !(label in fields)) fields[label] = value;
      index = next - 1;
    }
  }

  const cuce = fields["cuce"]?.match(CUCE)?.[0];
  if (!cuce) return undefined;
  return { cuce, fields, entity, modality, entityCode, total, activities, financiers };
}

/** One or more 「Ficha del proceso」 pages, as the browser copies them. The same CUCE twice is one process, the later copy kept. */
export function parseSicoesProcesses(text: string): SicoesProcess[] {
  const byCuce = new Map<string, SicoesProcess>();
  for (const page of splitPages(text)) {
    const process = parsePage(page);
    if (process) byCuce.set(process.cuce, process);
  }
  return [...byCuce.values()];
}

function activity(process: SicoesProcess, pattern: RegExp): string | undefined {
  return process.activities.find((entry) => pattern.test(fold(entry.name)))?.date;
}

function sentence(text: string | undefined): string | undefined {
  const trimmed = clean(text);
  if (!trimmed) return undefined;
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** 「Licitacion Publica」 as SICOES spells it, with its accents back. */
function modalityName(modality: string | undefined): string {
  const value = fold(modality ?? "");
  if (value.startsWith("licitacion publica")) return "Licitación Pública";
  if (value.startsWith("apoyo nacional")) return "Apoyo Nacional a la Producción y Empleo (ANPE)";
  return clean(modality) ?? "Proceso de contratación";
}

/** "Bolivianos" → BOB, "Dólares …" → USD; anything else is left out rather than guessed. */
function currencyOf(moneda: string | undefined): string | undefined {
  const value = fold(moneda ?? "bolivianos");
  if (value.startsWith("boliviano")) return "BOB";
  if (value.startsWith("dolar")) return "USD";
  return undefined;
}

// ---------------------------------------------------------------- mapping

export function boliviaSlug(cuce: string): string {
  return `bolivia-${slugify(cuce)}`;
}

/** One pasted Ficha as a Tender. */
export function mapSicoesToTender(process: SicoesProcess, now: Date = new Date()): Tender {
  const { cuce, fields } = process;
  // ENDE wraps it in quotes: “CONST. ELECTRIFICACIÓN RURAL …”.
  const title = clean(fields["objeto de la contratacion"]?.replace(/^[\s"“”']+|[\s"“”']+$/g, "")) ?? cuce;
  const buyer = clean(process.entity) ?? "";
  const scope = boliviaParticipationScope(fields["tipo de convocatoria"]);
  // 「Otras modalidades」 is a financier's own procedure (World Bank, IDB …): its rules say which.
  const external = /^otras modalidades/.test(fold(process.modality ?? "")) && fields["normativa utilizada"] ? ` (${fields["normativa utilizada"]})` : "";
  const procedureType = `${modalityName(process.modality)}${external} · Convocatoria Pública ${scope === "international_open" ? "Internacional" : "Nacional"}`;
  const scopeType = boliviaScopeType(fields["tipo de contratacion"]);
  const currency = currencyOf(fields["moneda considerada para el proceso"]);
  const amount = currency ? process.total : undefined;
  const governmentLevel = boliviaGovernmentLevel(buyer);
  const slug = boliviaSlug(cuce);

  const publicationDate = boliviaTime(fields["fecha de publicacion (en el sicoes)"]);
  const submissionDeadline = activity(process, /^presentacion de (propuestas|ofertas)/);

  const keyDates: TenderKeyDate[] = [];
  if (publicationDate) keyDates.push({ id: `${slug}-publication`, type: "publication", date: publicationDate });
  const visit = activity(process, /^inspeccion previa/);
  if (visit) keyDates.push({ id: `${slug}-site-visit`, type: "site_visit", date: visit });
  const questions = activity(process, /^consultas/);
  if (questions) keyDates.push({ id: `${slug}-questions`, type: "questions_deadline", date: questions });
  const clarification = activity(process, /^reunion de aclaracion/);
  if (clarification) keyDates.push({ id: `${slug}-clarification`, type: "clarification", date: clarification });
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const auction = activity(process, /^inicio de (la )?subasta/);
  if (auction) keyDates.push({ id: `${slug}-auction`, type: "opening", date: auction, notes: { es: "Inicio de la subasta electrónica", en: "Electronic auction starts", zh: "电子竞价开始" } });
  const opening = activity(process, /^apertura de (sobres|propuestas|ofertas)/);
  if (opening) keyDates.push({ id: `${slug}-opening`, type: "opening", date: opening });
  const award = activity(process, /^adjudicacion/);
  if (award) keyDates.push({ id: `${slug}-award`, type: "award", date: award, notes: { es: "Fecha máxima de adjudicación", en: "Award due by", zh: "最晚授标日期" } });
  const signing = activity(process, /firma de contrato/);
  if (signing) keyDates.push({ id: `${slug}-signing`, type: "contract_signing", date: signing });

  const subasta = fold(fields["subasta"] ?? "") === "si";
  const summary = [
    sentence(title),
    sentence(`Modalidad: ${procedureType}${process.entityCode ? ` (${process.entityCode})` : ""}`),
    fields["tipo de contratacion"] ? sentence(`Tipo de contratación: ${fields["tipo de contratacion"]}`) : undefined,
    fields["metodo de seleccion y adjudicacion"] ? sentence(`Método de selección: ${fields["metodo de seleccion y adjudicacion"]}`) : undefined,
    fields["forma de adjudicacion"] ? sentence(`Forma de adjudicación: ${fields["forma de adjudicacion"]}`) : undefined,
    subasta ? "Incluye subasta electrónica después de la presentación de propuestas." : undefined,
    fields["normativa utilizada"] ? sentence(`Normativa: ${fields["normativa utilizada"]}`) : undefined,
    process.financiers.length > 0 ? sentence(`Financiamiento: ${process.financiers.join(", ")}`) : undefined,
    `Publicado en el SICOES (sicoes.gob.bo); busque el CUCE ${cuce} para ver el Documento Base de Contratación.`,
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: BOLIVIA,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber: cuce,
    ...(amount !== undefined && currency ? { estimatedValue: amount, currency } : {}),
    sourceName: BOLIVIA_SICOES_SOURCE_NAME,
  });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: cuce,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: BOLIVIA,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    participationScope: scope,
    publicationDate: publicationDate ?? timestamp,
    ...(publicationDate ? {} : { publicationDateIsEstimated: true }),
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(amount !== undefined && currency ? { estimatedValue: amount, currency } : {}),
    status: boliviaStatus(submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: BOLIVIA_SICOES_SOURCE_NAME,
    sourceUrl: BOLIVIA_SICOES_SEARCH_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
