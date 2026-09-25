import type { Tender, TenderKeyDate } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { CODELCO_SOURCE_NAME, codelcoProcedureType } from "@/lib/relevance-codelco";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { CODELCO_LIST_URL, codelcoCallIsOpen, type CodelcoCall } from "@/lib/ingestion/connectors/codelco-live";

export { CODELCO_SOURCE_NAME };

const CODELCO_BUYER = "Corporación Nacional del Cobre de Chile (Codelco)";
/** Chile is UTC-3 from September to April and UTC-4 the rest of the year; end of day either way lands on the stated date. */
const SANTIAGO_END_OF_DAY = "T23:59:00-04:00";

/**
 * The Ariba event number when the subject carries one ("WS2170707422",
 * "Doc2151697849"), otherwise the publication date plus the subject — the
 * table has no id of its own, and two calls on one day with one subject
 * would be the same call.
 */
export function codelcoTenderNumber(call: CodelcoCall): string {
  const ariba = /\b(WS\d{6,}|Doc\d{6,})\b/i.exec(call.subject)?.[1];
  return ariba ?? `CODELCO-${call.publishedOn}-${slugify(call.subject).slice(0, 40)}`;
}

/** The subject without the procedure boilerplate in front of it. */
function cleanTitle(subject: string): string {
  return subject
    .replace(/^\W*(?:LICITACI[ÓO]N\s+(?:ABIERTA\s+)?(?:N\.?[º°]?\s*)?(?:WS\d+\s*)?(?:\(Doc\d+\)\s*)?(?:[-–]\s*Doc\d+\s*)?)/i, "")
    .replace(/^[“"”\s-–]+|[“"”\s]+$/g, "")
    .trim() || subject;
}

export function codelcoDocumentLinks(call: CodelcoCall, publishedAt: string): TenderDocumentLink[] {
  if (!call.link || !/\.pdf(?:$|\?)/i.test(call.link)) return [];
  return [{ sourceUrl: call.link, fileName: safeFileName(decodeURIComponent(call.link.split("/").pop() ?? "llamado_publico.pdf")), format: "pdf", publishedAt }];
}

/** One still-open call → a Tender; null for a closed one. */
export function mapCodelcoCallToTender(call: CodelcoCall, today: string, now: Date = new Date()): Tender | null {
  if (!codelcoCallIsOpen(call, today)) return null;

  const tenderNumber = codelcoTenderNumber(call);
  const title = cleanTitle(call.subject);
  const scopeType = call.kind === "Servicios" ? "services" : "equipment";
  const procedureType = codelcoProcedureType(call.operation);
  // The deadline to register interest, stated in the summary so it is never
  // mistaken for the bid deadline itself, which Ariba holds.
  const summary = [
    call.subject,
    call.interestDeadline ? `Manifestación de interés hasta el ${call.interestDeadline} (vía Ariba o correo electrónico).` : undefined,
    "Bases disponibles en SAP Ariba para proveedores inscritos en Codelco.",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer: CODELCO_BUYER,
    country: "Chile",
    governmentLevel: "public_company",
    scopeType,
    procedureType,
    tenderNumber,
    sourceName: CODELCO_SOURCE_NAME,
  });

  const slug = `codelco-${slugify(tenderNumber.replace(/^CODELCO-/, ""))}`;
  const publicationDate = new Date(`${call.publishedOn}T12:00:00-04:00`).toISOString();
  const submissionDeadline = call.interestDeadline ? new Date(`${call.interestDeadline}${SANTIAGO_END_OF_DAY}`).toISOString() : undefined;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer: CODELCO_BUYER,
    country: "Chile",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(call.operation && !/casa matriz/i.test(call.operation) ? { location: `División ${call.operation}` } : {}),
    status: /^\W*rfi\b/i.test(call.subject) ? "planned" : "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: CODELCO_SOURCE_NAME,
    sourceUrl: call.link && !/\.pdf(?:$|\?)/i.test(call.link) ? call.link : CODELCO_LIST_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
