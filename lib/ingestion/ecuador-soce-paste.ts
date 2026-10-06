import type { GovernmentLevel, Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * Ecuador's SOCE (compraspublicas.gob.ec), a procedure's page pasted by hand
 * (user, 2026-10-06). The admin picks the procedures from SOCE's search
 * results by their amount themselves (其实也不用第一层，我看项目金额就能判断了)
 * and pastes each one's page.
 *
 * Why a paste and not a connector: SOCE's search sits behind a CAPTCHA, which
 * this project does not get around, and SERCOP's open-data API publishes a
 * procedure's tender period only after bids have closed (0 of 44 recent LICB/
 * LICO records still open when sampled, 2026-10-06). The admin searches SOCE
 * in their own browser and pastes what it shows.
 *
 * The page as the browser copies it: 「Descripción del Proceso de
 * Contratación」 as "Label:<TAB>value" lines, then 「Fechas de Control del
 * Proceso」 as "Fecha …<TAB>yyyy-mm-dd hh:mm:ss<TAB>explanation" lines.
 * Several pages can be pasted one after another. The page does not name the
 * province; SOCE's search list does, and is not read.
 *
 * The page names the official in charge with their e-mail ("Funcionario
 * encargado del proceso"); that is personal data, and nothing here keeps it.
 *
 * Times are Ecuador's, UTC-5 all year (no daylight saving time). Amounts are
 * US dollars, Ecuador's currency, before VAT.
 */

export const ECUADOR = "Ecuador";
export const ECUADOR_SOCE_SOURCE_NAME = "SERCOP — Sistema Oficial de Contratación Pública (SOCE, Ecuador)";
export const ECUADOR_SOCE_SEARCH_URL = "https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/buscarProceso.cpe";
const ECUADOR_OFFSET = "-05:00";

/** Folds accents and case, for matching labels. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function clean(text: string | undefined): string | undefined {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value : undefined;
}

/** "2026-10-05 20:00:00" (Ecuador time) → ISO, UTC. */
export function ecuadorTime(text: string | undefined): string | undefined {
  const match = text?.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const parsed = new Date(`${match[1]}T${match[2]}:${match[3] ?? "00"}${ECUADOR_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** "$35,000.00", "USD 363,482.92" → 35000, 363482.92. */
export function ecuadorAmount(text: string | undefined): number | undefined {
  const match = text?.replace(/\s/g, "").match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The procedure's code prefix → its type, for when the page leaves 「Tipo de Contratación」 or 「Tipo Compra」 out. */
const PROCEDURE_BY_PREFIX: ReadonlyArray<[RegExp, string, TenderScopeType]> = [
  [/^LICB-/i, "Licitación de bienes", "equipment"],
  [/^LICO-/i, "Licitación de obras", "works"],
  [/^LICS-/i, "Licitación de servicios", "services"],
  [/^SIE-/i, "Subasta Inversa Electrónica", "unknown"],
  [/^COTB-/i, "Cotización de bienes", "equipment"],
  [/^COTO-/i, "Cotización de obras", "works"],
  [/^COTS-/i, "Cotización de servicios", "services"],
  [/^MCO-/i, "Menor Cuantía de obras", "works"],
  [/^MC[BS]*-/i, "Menor Cuantía", "unknown"],
  [/^CPC-/i, "Concurso Público de Consultoría", "consulting"],
  [/^LCC-/i, "Lista Corta de Consultoría", "consulting"],
  [/^CDC-/i, "Contratación Directa de Consultoría", "consulting"],
  [/^FI-/i, "Feria Inclusiva", "unknown"],
  [/^RE-/i, "Régimen Especial", "unknown"],
];

function procedureFromCode(code: string): { procedureType: string; scopeType: TenderScopeType } {
  for (const [pattern, procedureType, scopeType] of PROCEDURE_BY_PREFIX) if (pattern.test(code)) return { procedureType, scopeType };
  return { procedureType: "Procedimiento de contratación pública", scopeType: "unknown" };
}

/** SOCE's 「Tipo Compra」: Bien, Obra, Servicio, Consultoría. */
export function ecuadorScopeType(tipoCompra: string | undefined, fallback: TenderScopeType, title: string): TenderScopeType {
  const value = fold(tipoCompra ?? "");
  if (value.startsWith("bien") && value.includes("servicio")) return "equipment_services";
  if (value.startsWith("bien")) return "equipment";
  if (value.startsWith("obra")) return "works";
  if (value.startsWith("consultor")) return "consulting";
  if (value.startsWith("servicio")) return "services";
  if (fallback !== "unknown") return fallback;
  const head = fold(title);
  if (/^(reapertura (para|de) (la )?)?adquisicion|^compra\b|^provision\b|^suministro\b/.test(head)) return "equipment";
  if (/^(contratacion del )?servicio|^mantenimiento\b/.test(head)) return "services";
  if (/^construccion\b|^ejecucion de (la )?obra|^rehabilitacion\b/.test(head)) return "works";
  return "unknown";
}

export function ecuadorGovernmentLevel(entity: string): GovernmentLevel {
  const value = fold(entity);
  // First: a city's public company ("Empresa Pública Municipal …") is a company.
  if (/empresa publica|\bep\b|\bcelec\b|petroecuador|\bcnel\b|\bcnt\b|flota petrolera/.test(value)) return "public_company";
  if (/gobierno autonomo descentralizado provincial|\bprefectura\b|consejo provincial/.test(value)) return "state";
  if (/gobierno autonomo descentralizado|\bgad\b|\bmunicipal\b|\bmunicipio\b|\bparroquial\b/.test(value)) return "municipal";
  return "federal";
}

/** SOCE's 「Estado del Proceso」 → the platform's status. */
export function ecuadorStatus(estado: string | undefined, deadline: string | undefined, now: Date): TenderStatus {
  const value = fold(estado ?? "");
  if (/cancelad/.test(value)) return "cancelled";
  if (/desiert/.test(value)) return "deserted";
  if (/suspend/.test(value)) return "suspended";
  if (/adjudicad|ejecucion de contrato|finalizad|terminad|recepcion|en curso/.test(value)) return "awarded";
  if (/convalidacion|calificacion|evaluacion|oferta inicial|\bpuja\b|negociacion|por adjudicar|apertura|verificacion/.test(value)) return "submission_closed";
  if (deadline && Date.parse(deadline) < now.getTime()) return "submission_closed";
  return "open";
}

const CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{4}-[A-Z0-9-]+$/i;

export type SoceProcedure = {
  code: string;
  /** Folded label → value, from 「Descripción del Proceso de Contratación」, the official's contact left out. */
  fields: Record<string, string>;
  /** Folded label → ISO date, from 「Fechas de Control del Proceso」. */
  dates: Record<string, string>;
  /** The procedure's own page on SOCE, when the admin pasted its link alongside. Never fetched. */
  url?: string;
};

const PERSONAL_LABEL = /funcionario|correo|e-?mail|telefono|responsable|encargad/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HEADING = /Descripci[oó]n del Proceso de Contrataci[oó]n/i;

/**
 * A procedure's own page on SOCE, as its address bar shows it (user,
 * 2026-10-06: 导入时，请同时支持导入官方链接), e.g.
 * …/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=…
 * Stored as the row's source link; this project does not open it.
 */
const SOCE_LINK = /https?:\/\/(?:www\.)?compraspublicas\.gob\.ec\/ProcesoContratacion\/[^\s"'<>，。；]+/gi;

function cleanLink(link: string): string {
  return link.replace(/[),.;:]+$/, "");
}

/**
 * Splits the paste into pages, each with the link pasted next to it. A link
 * goes with the page below it; when every link instead comes after its page
 * (the paste starts with a page and ends with a link), with the page above.
 * A trailing link nothing claimed goes to the last page.
 */
function splitPages(text: string): { text: string; url?: string }[] {
  type Token = { kind: "page"; lines: string[] } | { kind: "link"; url: string };
  const tokens: Token[] = [];
  for (const line of text.split(/\r?\n/)) {
    const links = [...line.matchAll(SOCE_LINK)].map((match) => cleanLink(match[0]));
    const rest = line.replace(SOCE_LINK, "").trim();
    for (const url of links) tokens.push({ kind: "link", url });
    if (HEADING.test(rest)) tokens.push({ kind: "page", lines: [rest] });
    else if (rest) {
      const last = tokens.at(-1);
      if (last?.kind === "page") last.lines.push(line.replace(SOCE_LINK, ""));
      else if (last?.kind === "link") {
        // Text between a link and the next heading belongs to the page before the link, if any.
        const page = [...tokens].reverse().find((token) => token.kind === "page");
        if (page && page.kind === "page") page.lines.push(line);
      }
    }
  }
  const pages = tokens.filter((token): token is Extract<Token, { kind: "page" }> => token.kind === "page").map((page) => ({ page, url: undefined as string | undefined }));
  const linkAfter = tokens[0]?.kind === "page" && tokens.at(-1)?.kind === "link";
  let pending: string | undefined;
  let current: (typeof pages)[number] | undefined;
  for (const token of tokens) {
    if (token.kind === "page") {
      current = pages.find((entry) => entry.page === token);
      if (!linkAfter && pending && current) {
        current.url = pending;
        pending = undefined;
      }
    } else if (linkAfter) {
      if (current && !current.url) current.url = token.url;
    } else {
      pending = token.url;
    }
  }
  if (pending && current && !current.url) current.url = pending;
  return pages.map(({ page, url }) => ({ text: page.lines.join("\n"), url }));
}

/** A procedure page (or several, one after another) as the browser copies it, each with its official link if pasted. */
export function parseSoceProcedures(text: string): SoceProcedure[] {
  // By code: the same page pasted twice is one procedure, the later copy kept.
  const procedures = new Map<string, SoceProcedure>();
  for (const page of splitPages(text)) {
    const fields: Record<string, string> = {};
    const dates: Record<string, string> = {};
    const lines = page.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      // Label and date separated by a tab, or by spaces when the copy lost the tab.
      const dated = line.match(/^\s*(Fecha[^\t\d]*?)\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/i);
      if (dated) {
        const iso = ecuadorTime(dated[2]);
        const label = fold(dated[1]);
        if (iso && !(label in dates)) dates[label] = iso;
        continue;
      }
      const labelled = line.match(/^\s*([^\t:]{2,80}?)\s*:\s*(?:[\t ]+(.*))?$/);
      if (!labelled) continue;
      const label = fold(labelled[1]);
      if (PERSONAL_LABEL.test(label)) continue;
      let value = labelled[2]?.trim() ?? "";
      // A value the browser put on the next line instead of after the tab.
      if (!value && index + 1 < lines.length && !/^\s*[^\t:]{2,80}:\s*([\t ]|$)/.test(lines[index + 1])) value = lines[index + 1].trim();
      value = value.replace(EMAIL, "").replace(/\s+/g, " ").trim();
      if (value && !(label in fields)) fields[label] = value;
    }
    const code = fields["codigo"] ?? page.text.match(/Fechas de Control del Proceso\s*\n\s*(\S+)/i)?.[1];
    if (code && CODE.test(code)) procedures.set(code, { code, fields, dates, ...(page.url ? { url: page.url } : {}) });
  }
  return [...procedures.values()];
}

/** Links pasted with no page next to them: nothing to import, and the import says so. */
export function soceLinksWithoutPage(text: string): string[] {
  return HEADING.test(text) ? [] : [...text.matchAll(SOCE_LINK)].map((match) => cleanLink(match[0]));
}

function dateOf(dates: Record<string, string>, ...patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) for (const [label, iso] of Object.entries(dates)) if (pattern.test(label)) return iso;
  return undefined;
}

// 「Fecha Límite entrega Ofertas」 on a reverse auction, 「Fecha Límite de Propuestas」 on a works licitación (LICO-EPUNEMI-2026-007).
const SUBMISSION_LABEL = /limite (de )?(entrega (de )?)?(las )?(ofertas|propuestas)|entrega de (las )?(ofertas|propuestas)|presentacion de (las )?(ofertas|propuestas)/;

function sentence(text: string | undefined): string | undefined {
  const trimmed = clean(text);
  if (!trimmed) return undefined;
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// ---------------------------------------------------------------- mapping

export function ecuadorSlug(code: string): string {
  return `ecuador-${slugify(code)}`;
}

/** One pasted procedure page as a Tender. */
export function mapSoceToTender(procedure: SoceProcedure, now: Date = new Date()): Tender {
  const { code, fields, dates } = procedure;
  const byCode = procedureFromCode(code);

  const title = clean(fields["objeto de proceso"]) ?? code;
  const description = clean(fields["descripcion"]);
  const buyer = clean(fields["entidad"]) ?? "";
  const procedureType = clean(fields["tipo de contratacion"]?.replace(/\s*-\s*$/, "")) ?? byCode.procedureType;
  const scopeType = ecuadorScopeType(fields["tipo compra"], byCode.scopeType, title);
  const amount = ecuadorAmount(fields["presupuesto referencial total (sin iva)"] ?? fields["presupuesto referencial"]);
  const estado = clean(fields["estado del proceso"]);
  const governmentLevel = ecuadorGovernmentLevel(buyer);

  const publicationDate = dateOf(dates, /^fecha (de )?publicacion/);
  const submissionDeadline = dateOf(dates, SUBMISSION_LABEL);
  const slug = ecuadorSlug(code);

  const keyDates: TenderKeyDate[] = [];
  if (publicationDate) keyDates.push({ id: `${slug}-publication`, type: "publication", date: publicationDate });
  const questions = dateOf(dates, /limite (de )?preguntas/);
  if (questions) keyDates.push({ id: `${slug}-questions`, type: "questions_deadline", date: questions });
  const answers = dateOf(dates, /limite (de )?respuestas/);
  if (answers) {
    keyDates.push({ id: `${slug}-answers`, type: "clarification", date: answers, notes: { es: "Fecha límite de respuestas y aclaraciones", en: "Answers and clarifications due", zh: "答疑回复截止" } });
  }
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const opening = dateOf(dates, /apertura (de )?(las )?ofertas/);
  if (opening) keyDates.push({ id: `${slug}-opening`, type: "opening", date: opening });
  const auction = dateOf(dates, /inicio (de )?(la )?puja/);
  if (auction) keyDates.push({ id: `${slug}-auction`, type: "opening", date: auction, notes: { es: "Inicio de la puja (subasta inversa)", en: "Reverse auction starts", zh: "电子反向竞价开始" } });
  const award = dateOf(dates, /adjudicacion/);
  if (award) keyDates.push({ id: `${slug}-award`, type: "award", date: award, notes: { es: "Fecha estimada de adjudicación", en: "Estimated award date", zh: "预计授标日期" } });

  const summary = [
    sentence(title),
    description && fold(description) !== fold(title) ? sentence(description) : undefined,
    sentence(`Tipo de contratación: ${procedureType}${fields["tipo compra"] ? ` · ${fields["tipo compra"]}` : ""}`),
    fields["plazo de entrega"] ? sentence(`Plazo de entrega: ${fields["plazo de entrega"]}`) : undefined,
    fields["plazo de ejecucion"] ? sentence(`Plazo de ejecución: ${fields["plazo de ejecucion"]}`) : undefined,
    fields["forma de pago"] ? sentence(`Forma de pago: ${fields["forma de pago"]}`) : undefined,
    `Publicado en el SOCE de SERCOP (compraspublicas.gob.ec); busque el código ${code} para ver los pliegos.`,
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: ECUADOR,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber: code,
    ...(amount !== undefined ? { estimatedValue: amount, currency: "USD" } : {}),
    sourceName: ECUADOR_SOCE_SOURCE_NAME,
  });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: code,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: ECUADOR,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate: publicationDate ?? timestamp,
    ...(publicationDate ? {} : { publicationDateIsEstimated: true }),
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(amount !== undefined ? { estimatedValue: amount, currency: "USD" } : {}),
    status: ecuadorStatus(estado, submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: ECUADOR_SOCE_SOURCE_NAME,
    sourceUrl: procedure.url ?? ECUADOR_SOCE_SEARCH_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
