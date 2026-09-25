import type { Tender } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import type { TenderDocumentLink } from "@/lib/ingestion/document-links";
import { safeFileName } from "@/lib/ingestion/document-links";
import type { UpmeCall } from "@/lib/ingestion/connectors/upme-live";

export const UPME_SOURCE_NAME = "UPME — Convocatorias de Transmisión";
const UPME_BUYER = "Unidad de Planeación Minero Energética (UPME)";

/**
 * A pre-publication older than this is not a call that is about to open, it
 * is a draft UPME never took down: four 2018–2019 ones were still tagged
 * "Prepublicación" on 2026-09-25. Official calls get the wider window because
 * their investor hearing is often a year out, after rounds of addenda.
 */
const PREPUBLICATION_MAX_AGE_DAYS = 365;
const OFFICIAL_MAX_AGE_DAYS = 548;

/**
 * The stored procedure. "Selección de Inversionista" is what lib/relevance.ts
 * matches (FEDERAL_CONCESSION_AUCTION_PROCEDURES), the same statement by the
 * buyer that an ANEEL "Leilão de Transmissão" is: a long-term grid concession.
 */
export function upmeProcedureType(grid: UpmeCall["grid"]): string {
  return `Convocatoria Pública UPME — Selección de Inversionista (${grid === "STN" ? "STN, transmisión nacional" : "STR, transmisión regional"})`;
}

function ageInDays(isoDay: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(`${isoDay}T00:00:00-05:00`).getTime()) / 86_400_000);
}

/** Why a call is not imported, or null when it is. Exported for the run log and the test. */
export function upmeSkipReason(call: UpmeCall, now: Date = new Date()): string | null {
  if (call.stage !== "open") return `已过投标阶段（${call.stage}）`;
  if (!call.publishedOn) return "页面上没有发布日期";
  const age = ageInDays(call.publishedOn, now);
  if (call.prepublication && age > PREPUBLICATION_MAX_AGE_DAYS) return `预公告已 ${age} 天，没有转为正式公告`;
  if (!call.prepublication && age > OFFICIAL_MAX_AGE_DAYS) return `正式公告已 ${age} 天`;
  return null;
}

export function upmeDocumentLinks(call: UpmeCall, publishedAt: string | undefined): TenderDocumentLink[] {
  return call.documents.map((doc) => {
    const extension = /\.([a-z0-9]{2,4})(?:$|\?)/i.exec(doc.url)?.[1]?.toLowerCase();
    return {
      sourceUrl: doc.url,
      fileName: safeFileName(extension && !doc.label.toLowerCase().endsWith(`.${extension}`) ? `${doc.label}.${extension}` : doc.label),
      ...(extension ? { format: extension } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    };
  });
}

/**
 * One call → a Tender, or null when it is not biddable (see upmeSkipReason).
 *
 * No submission deadline: it lives in the DSI's cronograma, a PDF that the
 * addenda then move, and a date read from the wrong version is worse than
 * none. The DSI and every addendum are saved as document links, which is
 * what the document key-date extraction reads.
 */
export function mapUpmeCallToTender(call: UpmeCall, now: Date = new Date()): Tender | null {
  if (upmeSkipReason(call, now) !== null || !call.publishedOn) return null;

  // Noon, not midnight: the site renders days in Mexico City time (UTC-6),
  // where midnight in Bogotá is still the previous day.
  const publicationDate = new Date(`${call.publishedOn}T12:00:00-05:00`).toISOString();
  const procedureType = upmeProcedureType(call.grid);
  const { industries, relevance } = classifyStoredTender({
    title: call.title,
    summary: call.object,
    buyer: UPME_BUYER,
    country: "Colombia",
    governmentLevel: "federal",
    scopeType: "works",
    procedureType,
    tenderNumber: call.number,
    sourceName: UPME_SOURCE_NAME,
  });

  // "UPME 08-2026" → upme-08-2026, "UPME STR 05-2026" → upme-str-05-2026.
  const slug = `upme-${slugify(call.number.replace(/^UPME\s+/i, ""))}`;
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: call.number,
    title: untranslated(call.title),
    summary: untranslated(call.object),
    buyer: UPME_BUYER,
    country: "Colombia",
    governmentLevel: "federal",
    industries,
    scopeType: "works",
    procedureType,
    publicationDate,
    status: call.prepublication ? "planned" : "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [{ id: `${slug}-publication`, type: "publication", date: publicationDate }],
    risks: [],
    relevance,
    sourceName: UPME_SOURCE_NAME,
    sourceUrl: call.link,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
