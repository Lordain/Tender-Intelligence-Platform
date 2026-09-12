import type { GovernmentLevel, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { safeFileName, type TenderDocumentLink as SharedTenderDocumentLink } from "@/lib/ingestion/document-links";

/**
 * One record from Peru's real OCDS "record package" — the OECE
 * (formerly OSCE, "Organismo Especializado para las Contrataciones
 * Públicas Eficientes"; the institution renamed itself, and the old
 * `contratacionesabiertas.osce.gob.pe` subdomain genuinely stopped
 * resolving as a result) `contratacionesabiertas.oece.gob.pe/api/v1`
 * endpoint. Confirmed real end-to-end by the user directly in their own
 * browser: opened the live Swagger docs, ran `GET /files` (real listing
 * of monthly export files, most recent as of this writing being
 * `seace_v3-2026-08`, generated 2026-09-01), then `GET
 * /file/seace_v3/json/2026/08` (200, a real ~5.2MB ZIP containing this
 * JSON), unzipped it locally, and pasted real record content directly.
 * No authentication needed. Files are complete-calendar-month batches,
 * not a rolling window — see README.md's Peru section for the corrected
 * lag characterization (not a flat "~1 month": the current month is
 * fully invisible the entire time it's in progress, so real lag for the
 * newest tenders ranges ~1–30 days depending on where in the month a
 * tender was published).
 *
 * Real structural notes from that data (see the fixture, built from 9
 * of those real records, for the full shape):
 * - `tender.title` is NOT a description — it's the real procedure code
 *   (e.g. "CP-ABR-2-2026-MDSAC-1"), same role as `tenderNumber`
 *   elsewhere in this project. The real descriptive text is
 *   `tender.description`.
 * - `tender.value.amount` is frequently `0.0` (no value published yet) —
 *   same "absence isn't evidence of smallness" posture as Compras MX's
 *   open-tenders export; treated as "no value," not "worth $0."
 * - Real currencies seen: `PEN` (Soles, the overwhelming majority) and
 *   `USD` (a state power company's equipment purchase, EGEMSA) —
 *   genuinely multi-currency, unlike Colombia/Mexico sources.
 * - `mainProcurementCategory` (`services`/`goods`/`works`) maps cleanly
 *   onto this project's own `TenderScopeType`.
 * - `compiledRelease.awards` is present only once real "ADJUDICADO"
 *   outcomes appear — its presence is the real awarded-status signal,
 *   not `tender.items[].statusDetails` (which stayed "CONVOCADO" even
 *   on real records whose own document titles said "declaratoria de
 *   Desierto" — a real inconsistency in this source worth knowing about
 *   if `status` needs finer granularity later).
 * - `tenderPeriod.startDate`/`endDate` are the same single day in every
 *   real record seen (not a real submission deadline) — no field in
 *   this sample carries an actual bid-submission deadline, so
 *   `submissionDeadline` is deliberately left unset rather than guessed
 *   from `tenderPeriod` or `enquiryPeriod`.
 * - `enquiryPeriod` IS real and is mapped (as `questions_deadline`): it is
 *   the cronograma's "Formulación de consultas y observaciones" window,
 *   confirmed against a live ficha for LP-ABR-16-2026-MPV/COM-1 — feed
 *   2026-09-08→2026-09-10, ficha 08/09 00:01→10/09 23:59. Present on 8 of
 *   the 9 fixture records.
 * - What the feed does NOT carry is the rest of that cronograma. The ficha
 *   for that same tender lists Registro de participantes, Absolución de
 *   consultas, Integración de las Bases, **Presentación de propuestas
 *   (16/09/2026)**, Calificación y Evaluación and Otorgamiento de la Buena
 *   Pro; the OCDS record has no `milestones` array and nothing else
 *   date-bearing (checked every field of all 9 records). So 计划交标 being
 *   blank on a SEACE tender is the source's limit, not a parsing miss
 *   (user, 2026-09-11: 官网有日期，我们没有日期) — the cronograma exists only
 *   on the ficha HTML page, which is keyed by a UUID that appears nowhere
 *   in the record (see the sourceUrl note below). Deriving the submission
 *   date from the enquiry window would be arithmetic on the Reglamento's
 *   minimum intervals, i.e. a guess, so it is not done; SourcePanel tells
 *   the reader where on the official page to look instead.
 * - `tender.documents[]` carries real per-document download URLs
 *   (`prod1.seace.gob.pe/SeaceWeb-PRO/SdescargarArchivoAlfresco?fileCode=...`)
 *   and real type labels (biddingDocuments/evaluationReports/
 *   clarifications/awardNotice) — genuinely richer than what Colombia's
 *   SECOP II needed a *second* dataset for. Not consumed here (this
 *   mapper only produces `Tender`s); a follow-up `ingest-peru-documents`
 *   connector analogous to Colombia's could reuse this directly without
 *   a second live request, unlike Colombia.
 * - No confirmed real human-browsable deep link to one specific tender
 *   was found in this sample — `sources[0].url` is only the generic
 *   SEACE search portal, not a per-tender page. `sourceUrl` below uses
 *   the real OCDS release detail URL instead (genuinely resolves to
 *   real JSON content, just not a pretty HTML page) until a real
 *   human-facing deep-link pattern is confirmed.
 */
export type OeceRecord = {
  ocid: string;
  compiledRelease: {
    buyer?: { id?: string; name?: string };
    tender?: {
      id?: string;
      title?: string;
      description?: string;
      datePublished?: string;
      /** The cronograma's consultas y observaciones window — see this file's header. */
      enquiryPeriod?: { startDate?: string; endDate?: string };
      procurementMethodDetails?: string;
      mainProcurementCategory?: "goods" | "services" | "works";
      value?: { amount?: number; currency?: string };
      /** Real per-document download links — see oeceDocumentLinks() below. */
      documents?: OeceDocument[];
    };
    awards?: unknown[];
    parties?: { name?: string; address?: { locality?: string; department?: string } }[];
    /** OECE's own pointer at the system the record came from — for seace_v3 the real public SEACE search page. Used as sourceUrl; see this file's header. */
    sources?: { id?: string; name?: string; url?: string }[];
    /**
     * The `YYYY-MM` bucket this record belongs to (OECE's own
     * ocds_datasegmentation extension) — the same key the monthly bulk files
     * are cut on. Read back by peru-oece-live.ts to verify a filtered query
     * was actually honoured; see its dataSegmentationID note.
     */
    dataSegmentation?: { id?: string; criteria?: string[] };
  };
  releases?: { url?: string; date?: string }[];
};

export type OeceRecordPackage = {
  records: OeceRecord[];
};

export type OeceDocument = {
  id?: string;
  url?: string;
  title?: string;
  format?: string;
  documentType?: string;
  datePublished?: string;
};

/** Re-exported so this mapper's existing importers don't all have to change; the type itself now lives beside the table it is written to, because PEMEX produces them too. */
export type { TenderDocumentLink } from "@/lib/ingestion/document-links";

/**
 * Document types worth downloading for a bid/no-bid decision.
 *
 * Same posture as Colombia's isPreAwardDocument(): `evaluationReports` and
 * `awardNotice` describe an outcome that has already happened, so they cost a
 * download and tell a prospective bidder nothing about whether to bid.
 * `biddingDocuments` (Bases Administrativas / Bases Integradas) is the actual
 * tender document; `clarifications` is the consultas-y-observaciones round,
 * which routinely AMENDS those bases and so is part of the same read.
 */
const DOWNLOADABLE_DOCUMENT_TYPES = new Set(["biddingDocuments", "clarifications"]);



/**
 * The real bid-document links carried inline in one OCDS record.
 *
 * Deduped by URL: a record that has been re-compiled can legitimately repeat
 * the same document across `documents[]` entries with different ids, and a
 * ZIP with the same file twice is just a slower download.
 */
export function oeceDocumentLinks(record: OeceRecord): SharedTenderDocumentLink[] {
  const documents = record.compiledRelease?.tender?.documents ?? [];
  const byUrl = new Map<string, SharedTenderDocumentLink>();
  for (const document of documents) {
    const url = document.url?.trim();
    if (!url) continue;
    if (document.documentType && !DOWNLOADABLE_DOCUMENT_TYPES.has(document.documentType)) continue;
    if (byUrl.has(url)) continue;
    const format = document.format?.trim().toLowerCase() || undefined;
    const base = safeFileName(document.title?.trim() || document.documentType || document.id || "documento");
    byUrl.set(url, {
      sourceUrl: url,
      // The URL is a query-string handle with no filename in it, so the
      // extension has to come from `format` or the file lands on disk as a
      // nameless blob no viewer will open.
      fileName: format && !base.toLowerCase().endsWith(`.${format}`) ? `${base}.${format}` : base,
      documentType: document.documentType,
      format,
      publishedAt: document.datePublished,
    });
  }
  return [...byUrl.values()];
}

/**
 * Real buyer-name patterns from the sample: "MUNICIPALIDAD DISTRITAL DE
 * ..."/"MUNICIPALIDAD PROVINCIAL DE ..." -> municipal;
 * "GOBIERNO REGIONAL DE ..." -> state; real state-owned enterprises
 * (EGEMSA — "EMPRESA DE GENERACION ELECTRICA MACHUPICCHU", no "S.A."
 * suffix in the real buyer string despite the company's real legal name
 * carrying one; EPS GRAU — "ENTIDAD PRESTADORA DE SERVICIO DE
 * SANEAMIENTO GRAU S.A.") both start with "EMPRESA"/"ENTIDAD
 * PRESTADORA" -> public_company, matched on that prefix alone (a real
 * *buyer* in Peru's public procurement whose name starts with "Empresa"
 * is essentially always a state-owned utility — EGE.../EPS... are
 * standard Peruvian SOE naming conventions — private sellers appear
 * only as `tenderer`/`supplier` parties, never as `buyer`, so this
 * isn't at risk of matching a private company here); everything else
 * (ministries, the armed forces, the central bank) defaults to federal,
 * consistent with every real sample not matching the above being a
 * genuine national-level body.
 */
function inferGovernmentLevel(buyerName: string | undefined): GovernmentLevel {
  const name = buyerName ?? "";
  if (/municipalidad (distrital|provincial)/i.test(name)) return "municipal";
  if (/gobierno regional/i.test(name)) return "state";
  if (/^(empresa|entidad prestadora)\b/i.test(name)) return "public_company";
  return "federal";
}

const SCOPE_TYPE_BY_CATEGORY: Record<string, TenderScopeType> = {
  goods: "equipment",
  services: "services",
  works: "works",
};

function inferScopeType(category: string | undefined): TenderScopeType {
  return SCOPE_TYPE_BY_CATEGORY[category ?? ""] ?? "services";
}

/** `awards` present (even an empty array was never observed real — only appears once a real award exists) is the clean real signal; see this file's header comment for why `tender.items[].statusDetails` isn't used instead. */
function inferStatus(hasAwards: boolean): TenderStatus {
  return hasAwards ? "awarded" : "open";
}

/**
 * The Lima CALENDAR DAY the timestamp falls on, as midnight UTC.
 *
 * Unlike every other source this platform reads, OECE publishes real
 * times-of-day with a real offset — `2026-09-03T23:59:00-05:00` for an
 * enquiry window that the official ficha shows ending 10/09 23:59. A plain
 * `.toISOString()` turns that into `2026-09-04T04:59Z`, and since
 * `tender_key_dates.date` is a `date` column and formatDate() renders in UTC,
 * the reader would be shown a deadline one day LATER than the one the entity
 * published. Anchoring to the day in Peru is the only reading that matches
 * the ficha a bidder is working from.
 */
function limaCalendarDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  // en-CA gives YYYY-MM-DD, which is the format the rest of this pipeline
  // (and Postgres) already speaks.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
  return `${day}T00:00:00.000Z`;
}

const parseDate = limaCalendarDay;

/** The same Lima day, written the way the official ficha writes it (DD/MM/YYYY), for reading back inside a note. */
function limaDayLabel(rawOrIso: string): string {
  return new Date(rawOrIso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Every date this source actually publishes — which is publication, and the
 * consultas y observaciones window when the record carries one.
 *
 * The note names the Spanish stage rather than leaning on the generic
 * "提问截止" description, because a reader comparing this against the official
 * ficha is looking at a cronograma written in Spanish, and because it is the
 * honest place to say the window has a start as well as an end. The rest of
 * that cronograma — including the submission deadline — is not in this feed
 * at all; see this file's header.
 */
function oeceKeyDates(ocid: string, publicationDate: string, enquiryPeriod?: { startDate?: string; endDate?: string }): Tender["keyDates"] {
  const dates: Tender["keyDates"] = [{ id: `peru-${ocid}-publication`, type: "publication", date: publicationDate }];

  const enquiryEnd = limaCalendarDay(enquiryPeriod?.endDate);
  if (enquiryEnd && enquiryPeriod?.endDate) {
    // Labelled from the RAW timestamps, which still carry Peru's offset.
    const window = enquiryPeriod.startDate
      ? `${limaDayLabel(enquiryPeriod.startDate)} – ${limaDayLabel(enquiryPeriod.endDate)}`
      : limaDayLabel(enquiryPeriod.endDate);
    dates.push({
      id: `peru-${ocid}-enquiry`,
      type: "questions_deadline",
      date: enquiryEnd,
      notes: untranslated(`向采购实体提交质询与异议的截止日（Formulación de consultas y observaciones，${window}，秘鲁时间）。逾期不再受理，之后才会发布整合版标书（bases integradas）。`),
    });
  }

  return dates;
}

export function mapOeceRecordToTender(record: OeceRecord, sourceName: string): Tender | null {
  const compiled = record.compiledRelease;
  const tenderNumber = compiled.tender?.title?.trim();
  const title = compiled.tender?.description?.trim();
  const buyer = compiled.buyer?.name?.trim();
  if (!tenderNumber || !title || !buyer) return null;

  const publicationDate = parseDate(compiled.tender?.datePublished);
  if (!publicationDate) return null;

  const scopeType = inferScopeType(compiled.tender?.mainProcurementCategory);
  const now = new Date().toISOString();

  const rawValue = compiled.tender?.value?.amount;
  const estimatedValue = rawValue && rawValue > 0 ? rawValue : undefined;
  const currency = compiled.tender?.value?.currency;
  const governmentLevel = inferGovernmentLevel(buyer);
  // summary is the title again because that is what this row stores below.
  const { industries, relevance } = classifyStoredTender({
    title,
    summary: title,
    buyer,
    country: "Peru",
    governmentLevel,
    scopeType,
    estimatedValue,
    currency,
    sourceName,
  });

  const party = compiled.parties?.find((p) => p.name === buyer);
  const location = party?.address?.locality ?? party?.address?.department;

  // The SEACE platform page a human can actually use. Not the OCDS release
  // URL, which is unique to this tender but serves raw JSON: the user's call
  // (2026-09-11), once it was confirmed that SEACE's own per-tender page
  // (prod2.seace.gob.pe/.../fichaSeleccion.xhtml?id=<uuid>) is keyed by an
  // internal UUID that appears NOWHERE in the OCDS record — searched the whole
  // structure; the only UUID in there is a document fileCode — so no deep link
  // can be derived. "先不连标书，连平台": send the reader to the platform, where
  // the tenderNumber shown next to this link is the search key.
  const platformUrl = compiled.sources?.find((source) => source.url)?.url;

  return {
    id: crypto.randomUUID(),
    slug: `peru-${slugify(record.ocid)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Peru",
    governmentLevel,
    industries,
    scopeType,
    procedureType: compiled.tender?.procurementMethodDetails?.trim() || "Unknown",
    publicationDate,
    estimatedValue,
    currency: estimatedValue ? currency : undefined,
    location,
    status: inferStatus(Boolean(compiled.awards && compiled.awards.length > 0)),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: oeceKeyDates(record.ocid, publicationDate, compiled.tender?.enquiryPeriod),
    risks: [],
    relevance,
    sourceName,
    sourceUrl: platformUrl || "https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml",
    createdAt: now,
    updatedAt: now,
  };
}
