/**
 * Argentina's four sources → Tender. Argentina is STAGED
 * (lib/staged-countries.ts): what these rows become is visible in the admin
 * pages and nowhere public until the user opens the country.
 *
 * The rules are the platform's, unchanged (user, 2026-09-27: 我不想动现在的
 * 标准，如果项目数达不到也先保持这个规则), with two Argentine settings in
 * lib/relevance.ts: an unpriced row is treated as Mexico's is, and energy,
 * rail, power, transport and water are kept whatever their amount.
 */
import type { GovernmentLevel, Tender, TenderKeyDate, TenderParticipationScope, TenderScopeType } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { foldAccents } from "@/lib/text-fold";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { classifyStoredTender } from "@/lib/relevance";
import type { ArgentinaPortalRecord } from "@/lib/ingestion/connectors/argentina-portal-live";
import { ADIF_PORTAL_URL, type AdifTender } from "@/lib/ingestion/connectors/adif-live";
import type { BoletinNotice } from "@/lib/ingestion/connectors/boletin-oficial-live";

export const ARGENTINA_COUNTRY = "Argentina";

export const COMPRAR_SOURCE_NAME = "COMPR.AR — Portal de Compras Públicas (Argentina)";
export const CONTRATAR_SOURCE_NAME = "CONTRAT.AR — Obra Pública, Concesiones y Privatizaciones (Argentina)";
export const ADIF_SOURCE_NAME = "Trenes Argentinos Infraestructura (ADIF) — Portal de Licitaciones";
export const BOLETIN_SOURCE_NAME = "Boletín Oficial de la República Argentina — Tercera Sección";

export const ARGENTINA_SOURCE_NAMES = [COMPRAR_SOURCE_NAME, CONTRATAR_SOURCE_NAME, ADIF_SOURCE_NAME, BOLETIN_SOURCE_NAME] as const;

/** Buenos Aires is UTC-3 all year. */
const OFFSET = "-03:00";

// ── Dates ────────────────────────────────────────────────────────────────

/** "28/09/2026 08:00 Hrs." or "13/10/2026" → ISO, Buenos Aires time; null if not a date. */
export function argentineDateTime(value: string | null | undefined): string | null {
  const match = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D+(\d{1,2})[:.](\d{2}))?/.exec(value ?? "");
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${(hour ?? "12").padStart(2, "0")}:${minute ?? "00"}:00${OFFSET}`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * The first date after "apertura" in a Boletín notice, in whichever of its
 * spellings the organism used: "FECHA DE APERTURA: 24-09-2026 a las 12:00",
 * "APERTURA: 13 de Octubre de 2026 – 14:00hs", "3 de noviembre del 2026, a
 * las 11:00", "Apertura de ofertas: 22/10/2026 10:00".
 */
export function boletinOpeningDate(text: string): string | null {
  const folded = foldAccents(text);
  for (const at of folded.matchAll(/apertura/gi)) {
    const window = folded.slice(at.index!, at.index! + 220);
    const numeric = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[^\d]{1,25}?(\d{1,2})[:.](\d{2}))?/.exec(window);
    const spelled = /(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})(?:[^\d]{1,25}?(\d{1,2})[:.](\d{2}))?/i.exec(window);
    const first = [numeric, spelled].filter(Boolean).sort((a, b) => a!.index - b!.index)[0];
    if (!first) continue;
    if (first === spelled) {
      const month = MONTHS[spelled[2].toLowerCase()];
      if (!month) continue;
      return argentineDateTime(`${spelled[1]}/${month}/${spelled[3]} ${spelled[4] ?? "12"}:${spelled[5] ?? "00"}`);
    }
    return argentineDateTime(`${numeric![1]}/${numeric![2]}/${numeric![3]}${numeric![4] ? ` ${numeric![4]}:${numeric![5]}` : ""}`);
  }
  return null;
}

// ── Amounts ──────────────────────────────────────────────────────────────

/** "7.464.119,60" → 7464119.6 (Argentine grouping: dots, decimal comma). */
export function argentineNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/^\.+|[.,]+$/g, "");
  if (!/\d/.test(cleaned)) return null;
  const value = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The official budget a Boletín notice states, if it states one. Read only
 * after "presupuesto oficial" (or "monto estimado"), never anywhere else, so
 * the guarantee, the price of the tender documents or an expediente number is
 * never taken for it. A budget quoted in dollars wins over a peso add-on in
 * the same sentence (AGP, 2026-09-01: USD 7,464,119.60 "y" $121,600,000).
 */
export function boletinBudget(text: string): { amount: number; currency: "USD" | "ARS" } | null {
  const phrases = /presupuesto oficial|presupuesto estimado|presupuesto (?:de|por) (?:la suma de )?|monto (?:total )?estimado/gi;
  for (const at of text.matchAll(phrases)) {
    // "garantía … 1% del presupuesto oficial: $ 37.821.271,46" names the
    // guarantee, not the budget (Neuquén UPEFE, 2026-09-07).
    if (/garant[ií]a|%|por ciento/i.test(text.slice(Math.max(0, at.index! - 90), at.index!))) continue;
    const window = text.slice(at.index!, at.index! + 420);
    const usd = /(?:USD|U\$S|US\$|u\$s)\s*([\d.,]{4,})/.exec(window);
    if (usd) {
      const amount = argentineNumber(usd[1]);
      if (amount) return { amount, currency: "USD" };
    }
    const ars = /\$\s*\.?([\d.,]{4,})/.exec(window.replace(/(?:USD|U\$S|US\$|u\$s)\s*[\d.,]+/g, ""));
    if (ars) {
      const amount = argentineNumber(ars[1]);
      if (amount) return { amount, currency: "ARS" };
    }
  }
  return null;
}

// ── Shared ───────────────────────────────────────────────────────────────

/** "84/99 - Hospital Militar Regional Mendoza" → "Hospital Militar Regional Mendoza". */
export function withoutCode(value: string | undefined): string {
  return (value ?? "").replace(/^\s*[\d/.]+\s*-\s*/, "").trim();
}

export function argentinaTitle(value: string): string {
  return value.replace(/[\uE000-\uF8FF\u200B-\u200D\u2060\uFEFF]/g, " ").replace(/\s+/g, " ").replace(/[\s\-–.]+$/, "").trim();
}

/** What is being bought, from the words the buyer used for it. */
export function argentinaScopeType(text: string): TenderScopeType {
  const value = foldAccents(text).toLowerCase();
  if (/\b(fiscalizacion|inspeccion de obra|consultori|asesoramiento|auditoria|estudios? de|elaboracion de(?:l)? proyecto|proyecto ejecutivo|capacitacion)\b/.test(value)) return "consulting";
  if (/\b(concesion|obra|obras|construccion|renovacion de via|pavimentacion|repavimentacion|ampliacion|remodelacion|rehabilitacion|reparacion integral|montaje|malla \d)/.test(value)) return "works";
  if (/\b(adquisicion|compra|provision|suministro|equipamiento|equipos?|repuestos|insumos|materiales)\b/.test(value)) {
    return /\b(instalacion|puesta en (servicio|marcha)|montaje|mantenimiento)\b/.test(value) ? "equipment_services" : "equipment";
  }
  if (/\bservicios?\b|\blocacion\b|\balquiler\b|\bseguro\b/.test(value)) return "services";
  return "unknown";
}

function participationScopeOf(text: string | undefined): TenderParticipationScope | undefined {
  if (!text) return undefined;
  if (/internacional/i.test(text)) return "international_open";
  if (/nacional/i.test(text)) return "national";
  return undefined;
}

function keyDates(slug: string, publicationDate: string, submissionDeadline: string | null, questionsClose?: string | null): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (questionsClose) dates.push({ id: `${slug}-questions`, type: "questions_deadline", date: questionsClose });
  if (submissionDeadline) dates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  return dates;
}

function statusFor(submissionDeadline: string | null, now: Date): Tender["status"] {
  return submissionDeadline && Date.parse(submissionDeadline) < now.getTime() ? "submission_closed" : "open";
}

type Draft = {
  slug: string;
  tenderNumber: string;
  title: string;
  summary: string;
  buyer: string;
  governmentLevel: GovernmentLevel;
  scopeType: TenderScopeType;
  procedureType: string;
  participationScope?: TenderParticipationScope;
  publicationDate: string | null;
  submissionDeadline: string | null;
  questionsClose?: string | null;
  estimatedValue?: number;
  currency?: string;
  location?: string;
  sourceName: string;
  sourceUrl: string;
};

function toTender(draft: Draft, now: Date): Tender {
  const { industries, relevance } = classifyStoredTender({
    title: draft.title,
    summary: draft.summary,
    buyer: draft.buyer,
    country: ARGENTINA_COUNTRY,
    governmentLevel: draft.governmentLevel,
    scopeType: draft.scopeType,
    procedureType: draft.procedureType,
    tenderNumber: draft.tenderNumber,
    ...(draft.estimatedValue !== undefined ? { estimatedValue: draft.estimatedValue, currency: draft.currency } : {}),
    sourceName: draft.sourceName,
  });
  const timestamp = now.toISOString();
  const publicationDate = draft.publicationDate ?? timestamp;
  return {
    id: crypto.randomUUID(),
    slug: draft.slug,
    tenderNumber: draft.tenderNumber,
    title: untranslated(draft.title),
    summary: untranslated(draft.summary),
    buyer: draft.buyer,
    country: ARGENTINA_COUNTRY,
    governmentLevel: draft.governmentLevel,
    industries,
    scopeType: draft.scopeType,
    procedureType: draft.procedureType,
    ...(draft.participationScope ? { participationScope: draft.participationScope } : {}),
    publicationDate,
    ...(draft.publicationDate ? {} : { publicationDateIsEstimated: true }),
    ...(draft.submissionDeadline ? { submissionDeadline: draft.submissionDeadline } : {}),
    ...(draft.estimatedValue !== undefined ? { estimatedValue: draft.estimatedValue, currency: draft.currency } : {}),
    ...(draft.location ? { location: draft.location } : {}),
    status: statusFor(draft.submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: keyDates(draft.slug, publicationDate, draft.submissionDeadline, draft.questionsClose),
    risks: [],
    relevance,
    sourceName: draft.sourceName,
    sourceUrl: draft.sourceUrl,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sentence(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// ── COMPR.AR / CONTRAT.AR ────────────────────────────────────────────────

export function mapPortalRecordToTender(record: ArgentinaPortalRecord, now: Date = new Date()): Tender {
  const { process, row } = record;
  const isContratar = record.portal === "contratar";
  const title = argentinaTitle(process.name);
  const object = process.object && foldAccents(process.object).toLowerCase() !== foldAccents(process.name).toLowerCase() ? process.object : undefined;
  // The SAF is the ministry or force; the unit is its purchasing office. The
  // SAF says who is buying — "Estado Mayor General del Ejército", not
  // "Departamento Contaduría y Finanzas (EMGE)" — where the list gives one.
  const buyer = withoutCode(row.saf) || withoutCode(process.unit) || withoutCode(row.unit) || (isContratar ? "Administración Pública Nacional" : "Administración Pública Nacional");
  const procedure = process.procedure ?? row.procedureType;
  const procedureType = [procedure.replace(/^Licitacion\b/, "Licitación"), process.scope ? `Alcance ${process.scope}` : undefined, process.stage ? `Etapa ${process.stage}` : undefined]
    .filter(Boolean)
    .join(" — ");
  const submissionDeadline = argentineDateTime(process.openingText ?? row.openingText);
  const items = process.items.slice(0, 4).map((item) => item.split(";")[0].trim());
  const summary = [
    sentence(title),
    sentence(object ? `Objeto: ${object}` : undefined),
    sentence(`Organismo: ${buyer}${withoutCode(process.unit) && withoutCode(process.unit) !== buyer ? ` (${withoutCode(process.unit)})` : ""}`),
    sentence(`${procedure}${process.scope ? `, alcance ${process.scope.toLowerCase()}` : ""}${process.stage ? `, etapa ${process.stage.toLowerCase()}` : ""}`),
    isContratar && process.legalBasis ? sentence(`Encuadre legal: ${process.legalBasis}`) : undefined,
    process.durationText ? sentence(`Duración del contrato: ${process.durationText}`) : undefined,
    items.length > 0 ? sentence(`Renglones: ${items.join("; ")}${process.items.length > items.length ? ` y ${process.items.length - items.length} más` : ""}`) : undefined,
    submissionDeadline ? sentence(`Apertura de ofertas: ${process.openingText ?? row.openingText}`) : undefined,
    `Publicado en ${isContratar ? "CONTRAT.AR (contratar.gob.ar)" : "COMPR.AR (comprar.gob.ar)"}; pliegos y anexos descargables sin registro desde la página del proceso.`,
  ]
    .filter(Boolean)
    .join(" ");

  return toTender(
    {
      slug: `argentina-${record.portal}-${slugify(process.processNumber)}`,
      tenderNumber: process.processNumber,
      title,
      summary,
      buyer,
      governmentLevel: "federal",
      scopeType: isContratar && argentinaScopeType(`${title} ${object ?? ""}`) === "unknown" ? "works" : argentinaScopeType(`${title} ${object ?? ""}`),
      procedureType,
      participationScope: participationScopeOf(process.scope),
      publicationDate: argentineDateTime(process.publishedText),
      submissionDeadline,
      questionsClose: argentineDateTime(process.questionsCloseText),
      sourceName: isContratar ? CONTRATAR_SOURCE_NAME : COMPRAR_SOURCE_NAME,
      sourceUrl: record.url,
    },
    now,
  );
}

// ── ADIF ─────────────────────────────────────────────────────────────────

const ADIF_BUYER = "Trenes Argentinos Infraestructura (ADIF S.A.)";

export function adifTenderNumber(tender: AdifTender): string {
  const initials = foldAccents(tender.procedureType)
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word) && !/^(de|e|y|por|la|el)$/i.test(word))
    .map((word) => word[0].toUpperCase())
    .join("");
  return `ADIF ${initials} ${tender.number}`.trim();
}

export function mapAdifTenderToTender(tender: AdifTender, now: Date = new Date()): Tender {
  const title = argentinaTitle(tender.description);
  const tenderNumber = adifTenderNumber(tender);
  const submissionDeadline = argentineDateTime(tender.openingDate);
  const summary = [
    sentence(title),
    sentence(`Organismo: ${ADIF_BUYER}`),
    sentence(`${tender.procedureType} N° ${tender.number} (${tender.kind.toLowerCase()})`),
    tender.openingDate ? sentence(`Apertura de sobres: ${tender.openingDate}`) : undefined,
    "Publicado en el Portal de Licitaciones de ADIF; aviso, pliegos y circulares descargables sin registro.",
  ]
    .filter(Boolean)
    .join(" ");
  return toTender(
    {
      slug: `argentina-adif-${slugify(foldAccents(tenderNumber.replace(/^ADIF\s+/, "")))}`,
      tenderNumber,
      title,
      summary,
      buyer: ADIF_BUYER,
      governmentLevel: "public_company",
      scopeType: argentinaScopeType(tender.description) === "unknown" ? (tender.kind === "Compra" ? "equipment" : "works") : argentinaScopeType(tender.description),
      procedureType: tender.procedureType,
      participationScope: participationScopeOf(tender.procedureType),
      publicationDate: null,
      submissionDeadline,
      sourceName: ADIF_SOURCE_NAME,
      sourceUrl: tender.files.find((file) => file.category === "Aviso")?.url ?? ADIF_PORTAL_URL,
    },
    now,
  );
}

export function adifDocumentLinks(tender: AdifTender): TenderDocumentLink[] {
  return tender.files.map((file) => ({
    sourceUrl: file.url,
    fileName: safeFileName(file.fileName || decodeURIComponent(file.url.split("/").pop() ?? "documento")),
    documentType: file.category,
    format: (/\.(\w{2,4})$/.exec(file.url)?.[1] ?? "pdf").toLowerCase(),
  }));
}

// ── Boletín Oficial ──────────────────────────────────────────────────────

/** Categories that are not calls for bids. */
const BOLETIN_NOT_A_CALL = /^(ADJUDICACIONES|PREADJUDICACIONES|DICTAMEN|VENTAS Y OFRECIMIENTOS|LOCACIONES)/i;

/** A notice about a call already published — an amendment, extension, suspension — not the call. */
const BOLETIN_AMENDMENT = /\b(circular (?:modificatoria|aclaratoria)|tipo de circular|pr[oó]rroga|prorrogad[ao]|suspensi[oó]n|se suspende|dej(?:a|ar) sin efecto|anulaci[oó]n|fracasad[ao]|desiert[ao])\b/i;

/**
 * Why a Boletín notice is not imported, or null when it is. Everything COMPR.AR,
 * CONTRAT.AR or ADIF already carries is left to those connectors, which have
 * the process page and the documents: a notice generated by the national
 * system carries its "UOC:" line, and ADIF's point to its own portal.
 */
export function boletinSkipReason(notice: BoletinNotice): string | null {
  if (BOLETIN_NOT_A_CALL.test(notice.category)) return "不是招标公告（授标、评标、出售等）";
  if (/\bUOC:\s*\d/.test(notice.text) || /comprar\.gob\.ar|contratar\.gob\.ar/i.test(notice.text)) return "COMPR.AR / CONTRAT.AR 已有";
  if (/ADMINISTRACI[OÓ]N DE INFRAESTRUCTURAS FERROVIARIAS|plataforma\.adifsa/i.test(`${notice.organism} ${notice.text}`)) return "ADIF 门户已有";
  if (BOLETIN_AMENDMENT.test(`${notice.procedure} ${notice.text.slice(0, 260)}`)) return "修改、延期或暂停通知，不是新招标";
  return null;
}

/**
 * What the notice is for: the quoted object after "OBJETO"/"OBRA", else the
 * first long quotation, else the opening sentence.
 */
export function boletinObject(text: string): string {
  const labelled = /\b(?:OBJETO|Objeto|OBRA|Obra)\s*:?\s*[“"]\s*([^”"]{12,400}?)\s*[”"]/.exec(text);
  if (labelled) return labelled[1].replace(/^(?:OBRA|Obra)\s*:\s*/, "");
  const plain = /\bOBJETO\s*:\s*(.{12,300}?)(?=\s+(?:DESTINO|PRESUPUESTO|FECHA|LUGAR|RETIRO|CONSULTA|APERTURA|PLAZO|ETAPA|VALOR|MODALIDAD|CLASE|GARANT[IÍ]A)\b|$)/.exec(text);
  if (plain) return plain[1];
  const quoted = /[“"]\s*([^”"]{15,400}?)\s*[”"]/.exec(text);
  if (quoted) return quoted[1].replace(/^(?:OBRA|Obra)\s*:\s*/, "");
  return text.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/)[0].slice(0, 240);
}

export function boletinGovernmentLevel(organism: string): GovernmentLevel {
  const value = foldAccents(organism).toUpperCase();
  if (/^PROVINCIA\b|\bPROVINCIAL\b|GOBIERNO DE LA PROVINCIA/.test(value)) return "state";
  if (/MUNICIPALIDAD|MUNICIPIO/.test(value)) return "municipal";
  if (/\bS\.?\s?A\.?U?\.?\b|\bS\.?E\.?\b|SOCIEDAD|ENTIDAD BINACIONAL|NUCLEOELECTRICA|OPERADORA FERROVIARIA|BELGRANO CARGAS|EMPRESA /.test(value)) return "public_company";
  return "federal";
}

/** "N° 67548" from the text when the heading carries no number (Nucleoeléctrica's do not). */
function boletinProcedureNumber(notice: BoletinNotice): string {
  if (/\d/.test(notice.procedure)) return notice.procedure.replace(/\s+/g, " ").trim();
  const inText = /(?:Licitaci[oó]n|Concurso|Contrataci[oó]n)[^.]{0,40}?N[°º.]\s*([\d/.-]+\d)/i.exec(notice.text);
  return `${notice.procedure.replace(/\s+/g, " ").trim()}${inText ? ` N° ${inText[1]}` : ""}`.trim();
}

export function boletinFinancier(text: string): string | undefined {
  if (/Banco Interamericano de Desarrollo|\bBID\b|-OC-AR\b/.test(text)) return "Banco Interamericano de Desarrollo (BID)";
  if (/Banco Mundial|\bBIRF\b|Banco Internacional de Reconstrucci[oó]n/.test(text)) return "Banco Mundial (BIRF)";
  if (/\bCAF\b|Corporaci[oó]n Andina de Fomento|Banco de Desarrollo de Am[eé]rica Latina/.test(text)) return "CAF";
  if (/FONPLATA/.test(text)) return "FONPLATA";
  return undefined;
}

export function mapBoletinNoticeToTender(notice: BoletinNotice, now: Date = new Date()): Tender {
  const object = boletinObject(notice.text);
  const title = argentinaTitle(object);
  const procedure = boletinProcedureNumber(notice);
  const buyer = notice.organism.replace(/\s+/g, " ").trim();
  const budget = boletinBudget(notice.text);
  const submissionDeadline = boletinOpeningDate(notice.text);
  const financier = boletinFinancier(notice.text);
  const scopeText = /internacional/i.test(`${notice.procedure} ${notice.text}`) ? "Licitación internacional" : undefined;
  const summary = [
    sentence(title),
    sentence(`Organismo: ${buyer}`),
    sentence(procedure),
    scopeText ? sentence(scopeText) : undefined,
    financier ? sentence(`Financiamiento: ${financier}`) : undefined,
    `Texto del aviso: ${notice.text.slice(0, 900)}${notice.text.length > 900 ? "…" : ""}`,
  ]
    .filter(Boolean)
    .join(" ");
  const orgSlug = slugify(foldAccents(notice.organism)).split("-").slice(0, 8).join("-");
  return toTender(
    {
      slug: `argentina-bo-${orgSlug}-${slugify(foldAccents(procedure))}`.slice(0, 160),
      tenderNumber: procedure,
      title,
      summary,
      buyer,
      governmentLevel: boletinGovernmentLevel(notice.organism),
      scopeType: notice.category.startsWith("OBRAS") ? "works" : argentinaScopeType(`${object} ${notice.category}`),
      procedureType: notice.procedure.replace(/\s+/g, " ").trim(),
      participationScope: participationScopeOf(`${notice.procedure} ${/internacional/i.test(notice.text) ? "internacional" : ""}`),
      publicationDate: argentineDateTime(notice.publishedDate),
      submissionDeadline,
      ...(budget ? { estimatedValue: budget.amount, currency: budget.currency } : {}),
      sourceName: BOLETIN_SOURCE_NAME,
      sourceUrl: notice.url,
    },
    now,
  );
}
