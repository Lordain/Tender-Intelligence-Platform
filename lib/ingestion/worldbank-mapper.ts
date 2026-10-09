import type { GovernmentLevel, Tender, TenderKeyDate, TenderParticipationScope, TenderScopeType, TenderStatus } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { lenderReference, lenderReferenceSlug } from "@/lib/ingestion/lender-reference";
import type { WorldBankNotice } from "@/lib/ingestion/connectors/worldbank-procnotices-live";

/**
 * A World Bank procurement notice (connectors/worldbank-procnotices-live.ts)
 * as a Tender, for any of the platform's countries. Added 2026-10-09 as a
 * read-only trial on Bolivia (user: 我建议做成所有国家通用，先在玻利维亚试运行 OK).
 *
 * Which notices: calls for bids or prequalification, and requests for
 * expressions of interest from firms. Left out: contract awards and general
 * notices (not a call), requests for quotations (the Bank's shopping method,
 * small by design), direct selection and individual consultants.
 *
 * A call with a STEP reference (BO-ENDE-568419-CW-RFB) is stored under it,
 * the same row as the same call imported from the country's own system
 * (lib/ingestion/lender-reference.ts).
 *
 * The notice names no budget field. The reference price is taken from the
 * notice text when it is written next to a label and a currency the text
 * names («precio referencial total … Bs. 26.193.790,72»); a bare "$" is not
 * read, because it is a peso in half the countries here. The market approach
 * (national or international) likewise comes from the text.
 */

export const WORLDBANK_SOURCE_NAME = "Banco Mundial — Avisos de adquisiciones (World Bank procurement notices)";

/** The platform's countries, by the API's project_ctry_name, with their time zone. */
export const WORLDBANK_COUNTRIES: Readonly<Record<string, { timeZone: string }>> = {
  Mexico: { timeZone: "America/Mexico_City" },
  Brazil: { timeZone: "America/Sao_Paulo" },
  Colombia: { timeZone: "America/Bogota" },
  Peru: { timeZone: "America/Lima" },
  Chile: { timeZone: "America/Santiago" },
  Argentina: { timeZone: "America/Argentina/Buenos_Aires" },
  "Dominican Republic": { timeZone: "America/Santo_Domingo" },
  Panama: { timeZone: "America/Panama" },
  Ecuador: { timeZone: "America/Guayaquil" },
  Guyana: { timeZone: "America/Guyana" },
  Bolivia: { timeZone: "America/La_Paz" },
};

const CALL_TYPES = /^(invitation for bids|invitation for prequalification|request for expression of interest)$/i;
/** The Bank's small or non-competitive methods. */
const LEFT_OUT_METHODS = /request for quotations|direct selection|direct contracting|individual consultant|shopping/i;

/** Why a notice is not a call worth mapping, or undefined when it is. */
export function worldBankSkipReason(notice: WorldBankNotice): string | undefined {
  if (!CALL_TYPES.test(notice.notice_type?.trim() ?? "")) return `不是招标公告（${notice.notice_type ?? "未注明类型"}）`;
  if (LEFT_OUT_METHODS.test(notice.procurement_method_name ?? "")) return `小额或非竞争方式（${notice.procurement_method_name}）`;
  if (!WORLDBANK_COUNTRIES[notice.project_ctry_name ?? ""]) return `不是平台国家（${notice.project_ctry_name ?? "—"}）`;
  return undefined;
}

function textOf(html: string | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;?/g, " ")
    .replace(/&([a-z])(acute|tilde|uml|grave|circ);/gi, (_, letter: string, mark: string) => `${letter}${{ acute: "́", tilde: "̃", uml: "̈", grave: "̀", circ: "̂" }[mark.toLowerCase()] ?? ""}`.normalize("NFC"))
    .replace(/&[lr]dquo;|&quot;/g, '"')
    .replace(/&ordm;|&deg;/g, "°")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ");
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "26.193.790,72.-", "1,250,000.00", "3 500 000" → a number. The separator followed by exactly two digits at the end is the decimal one. */
export function worldBankNumber(text: string): number | undefined {
  const raw = text.replace(/[\s ]/g, "").replace(/[.,-]+$/, "").match(/\d[\d.,]*/)?.[0];
  if (!raw) return undefined;
  const decimal = raw.match(/[.,](\d{2})$/);
  const whole = (decimal ? raw.slice(0, -3) : raw).replace(/[.,]/g, "");
  const value = Number(decimal ? `${whole}.${decimal[1]}` : whole);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

const CURRENCIES: ReadonlyArray<[RegExp, string]> = [
  [/^(bs\.?|bob|bolivianos?)$/i, "BOB"],
  [/^(usd|us\$|u\$s|dolares|dólares|dollars?|dólares americanos)$/i, "USD"],
  [/^(mxn)$/i, "MXN"],
  [/^(cop)$/i, "COP"],
  [/^(pen|s\/\.?|soles)$/i, "PEN"],
  [/^(ars)$/i, "ARS"],
  [/^(clp)$/i, "CLP"],
  [/^(dop|rd\$)$/i, "DOP"],
  [/^(brl|r\$|reais)$/i, "BRL"],
  [/^(gyd|g\$)$/i, "GYD"],
];

const PRICE_LABEL = /(precio referencial(?: total)?|presupuesto (?:oficial|referencial|estimado)|monto (?:estimado|referencial)|valor (?:estimado|referencial)|costo estimado|estimated (?:cost|value|budget|contract value))/i;
const AMOUNT_AFTER_LABEL = /^[^.\n]{0,80}?\b(Bs\.?|BOB|bolivianos|USD|US\$|U\$S|d[oó]lares|dollars|MXN|COP|PEN|S\/\.?|ARS|CLP|DOP|RD\$|BRL|R\$|GYD|G\$)\s*\.?\s*([\d][\d.,\s ]*\d)/i;
const AMOUNT_BEFORE_CURRENCY = /^[^.\n]{0,80}?\b([\d][\d.,]*\d)\s*\.?-?\s*\(?\s*(bolivianos|d[oó]lares(?: americanos)?|dollars)\b/i;

/** The reference price the notice text states, with its currency, or undefined. */
export function worldBankAmount(text: string): { value: number; currency: string } | undefined {
  for (const match of text.matchAll(new RegExp(PRICE_LABEL, "gi"))) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    const before = AMOUNT_AFTER_LABEL.exec(after);
    const pair = before ? { symbol: before[1], number: before[2] } : (() => {
      const other = AMOUNT_BEFORE_CURRENCY.exec(after);
      return other ? { symbol: other[2], number: other[1] } : undefined;
    })();
    if (!pair) continue;
    const currency = CURRENCIES.find(([pattern]) => pattern.test(pair.symbol.trim()))?.[1];
    const value = worldBankNumber(pair.number);
    if (currency && value) return { value, currency };
  }
  return undefined;
}

/** Whether the call is open to foreign bidders, from the notice text; undefined when it does not say. */
export function worldBankMarket(text: string): TenderParticipationScope | undefined {
  const value = fold(text);
  if (/(abierta|abierto|competitiva|competitivo|publica)\s+internacional|licitacion publica internacional|\b(open|competitive)\s+international\b|international (competitive|open)|\bicb\b|\blpi\b/.test(value)) return "international_open";
  if (/(abierta|abierto|competitiva|competitivo|publica)\s+nacional|\b(open|competitive)\s+national\b|national (competitive|open)|\bncb\b|\blpn\b/.test(value)) return "national";
  return undefined;
}

/** Video calls and the like, not where the documents are. */
const NOT_DOCUMENTS = /webex|zoom\.us|teams\.microsoft|meet\.google|whatsapp|facebook|youtube/i;

/**
 * Where the notice says the bid documents are (user, 2026-10-09: 公告能看到标
 * 书？然后能下载？): the agency's site, the national system or a shared folder,
 * as the notice text writes them. The notice itself carries no files. At most
 * three, in order; never fetched by this platform.
 */
export function worldBankDocumentChannels(text: string): string[] {
  const links: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>()]+/gi)) {
    const link = match[0].replace(/[.,;:]+$/, "");
    if (NOT_DOCUMENTS.test(link) || links.includes(link)) continue;
    links.push(link);
    if (links.length === 3) break;
  }
  return links;
}

export function worldBankScopeType(group: string | undefined): TenderScopeType {
  switch ((group ?? "").toUpperCase()) {
    case "CW":
      return "works";
    case "GO":
      return "equipment";
    case "NC":
      return "services";
    case "CS":
      return "consulting";
    default:
      return "unknown";
  }
}

export function worldBankGovernmentLevel(organization: string): GovernmentLevel {
  const value = fold(organization);
  if (/\bempresa\b|\bcorporacion\b|\bende\b|\bypfb\b|\bcompanhia\b|\bcompania\b/.test(value)) return "public_company";
  if (/municipal|alcaldia|prefeitura|municipio/.test(value)) return "municipal";
  if (/departamental|gobernacion|provincial|provincia de|estado de|governo do estado/.test(value)) return "state";
  return "federal";
}

/** A local wall-clock time in `timeZone` → ISO, UTC. */
export function zonedIso(day: string, time: string | undefined, timeZone: string): string | undefined {
  const date = day.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!date) return undefined;
  const clock = time?.trim().match(/^(\d{1,2}):(\d{2})/);
  const [hours, minutes] = clock ? [Number(clock[1]), Number(clock[2])] : [12, 0];
  const guess = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), hours, minutes);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (wall - guess)).toISOString();
}

function clean(text: string | undefined): string | undefined {
  const value = text?.replace(/\s+/g, " ").replace(/^[\s"“”']+|[\s"“”']+$/g, "").trim();
  return value ? value : undefined;
}

export function worldBankStatus(deadline: string | undefined, now: Date): TenderStatus {
  return deadline && Date.parse(deadline) < now.getTime() ? "submission_closed" : "open";
}

/** One notice (already past worldBankSkipReason) as a Tender. */
export function mapWorldBankNotice(notice: WorldBankNotice, now: Date = new Date()): Tender {
  const country = notice.project_ctry_name ?? "";
  const { timeZone } = WORLDBANK_COUNTRIES[country] ?? { timeZone: "UTC" };
  const reference = lenderReference(notice.bid_reference_no);
  const tenderNumber = reference ?? clean(notice.bid_reference_no) ?? notice.id;
  const slug = reference ? lenderReferenceSlug(country, reference) : `${slugify(country)}-worldbank-${slugify(notice.id)}`;
  const text = textOf(notice.notice_text);

  const title = clean(notice.bid_description) ?? clean(notice.project_name) ?? tenderNumber;
  const buyer = clean(notice.contact_organization) ?? "";
  const scopeType = worldBankScopeType(notice.procurement_group);
  const market = worldBankMarket(text);
  const method = clean(notice.procurement_method_name) ?? clean(notice.notice_type) ?? "Procurement notice";
  const procedureType = `${method} · Banco Mundial${market === "international_open" ? " · Internacional" : market === "national" ? " · Nacional" : ""}`;
  const amount = worldBankAmount(text);
  const governmentLevel = worldBankGovernmentLevel(buyer);
  const channels = worldBankDocumentChannels(text);

  const publicationDate = notice.submission_date ? new Date(notice.submission_date).toISOString() : undefined;
  const submissionDeadline = notice.submission_deadline_date ? zonedIso(notice.submission_deadline_date, notice.submission_deadline_time, timeZone) : undefined;
  const keyDates: TenderKeyDate[] = [];
  if (publicationDate) keyDates.push({ id: `${slug}-publication`, type: "publication", date: publicationDate });
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });

  const summary = [
    `${title.replace(/[.。]$/, "")}.`,
    notice.project_name ? `Proyecto financiado por el Banco Mundial: ${clean(notice.project_name)}${notice.project_id ? ` (${notice.project_id})` : ""}.` : undefined,
    `Método: ${method}${notice.notice_type ? ` · ${notice.notice_type}` : ""}.`,
    market === "international_open" ? "Abierta a oferentes internacionales." : market === "national" ? "Convocatoria abierta nacional." : undefined,
    channels.length > 0 ? `Documentos de la licitación según el aviso: ${channels.join(" ; ")}.` : undefined,
    `Aviso ${notice.id} en el portal de adquisiciones del Banco Mundial; los documentos se solicitan a la entidad contratante.`,
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber,
    ...(amount ? { estimatedValue: amount.value, currency: amount.currency } : {}),
    sourceName: WORLDBANK_SOURCE_NAME,
  });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    ...(market ? { participationScope: market } : {}),
    publicationDate: publicationDate ?? timestamp,
    ...(publicationDate ? {} : { publicationDateIsEstimated: true }),
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(amount ? { estimatedValue: amount.value, currency: amount.currency } : {}),
    status: worldBankStatus(submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: WORLDBANK_SOURCE_NAME,
    sourceUrl: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${encodeURIComponent(notice.id)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
