import type { Tender, TenderKeyDate } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { CEMIG_SOURCE_NAME } from "@/lib/relevance-cemig";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { cemigEditalUrl, cemigProcessUrl, type CemigProcess } from "@/lib/ingestion/connectors/cemig-live";

export { CEMIG_SOURCE_NAME };

/** The holding company appears under its registry abbreviation; everything else is already a readable subsidiary name. */
function buyerName(process: CemigProcess): string {
  const unit = (process.detail.organizationUnit?.organizationUnitName ?? process.row.organizationUnitName ?? "").trim();
  if (!unit || /^cia energ[ée]tica de minas gerais$/i.test(unit)) return "Companhia Energética de Minas Gerais (Cemig)";
  return unit;
}

function scopeTypeOf(rule: string): Tender["scopeType"] {
  if (/servi[çc]os?/i.test(rule) && !/solu[çc][õo]es integradas/i.test(rule)) return "services";
  if (/solu[çc][õo]es integradas/i.test(rule)) return "works";
  return "equipment";
}

/**
 * "Pregão Eletrônico - Material · Cemig (Lei 13.303/2016)". The rule is what
 * lib/relevance-cemig.ts reads, so it is stored verbatim — a reclassify of the
 * stored row must see what the import saw.
 */
export function cemigProcedureType(process: CemigProcess): string {
  const rule = process.detail.rule?.description?.trim() || "Processo Eletrônico";
  const law = process.detail.legalSupport?.description?.trim();
  return `${rule} · Cemig${law ? ` (${law})` : ""}`;
}

function iso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function cemigDocumentLinks(process: CemigProcess, publishedAt: string): TenderDocumentLink[] {
  const file = process.row.auctionFile?.trim();
  if (!file) return [];
  return [{ sourceUrl: cemigEditalUrl(file), fileName: safeFileName(`Edital_${process.detail.processNumber || process.row.auctionNumber}.zip`), format: "zip", publishedAt }];
}

/** One published process → a Tender; null for one that is cancelled, finished or no longer published. */
export function mapCemigProcessToTender(process: CemigProcess, now: Date = new Date()): Tender | null {
  const { row, detail } = process;
  if (detail.isCanceled || detail.isFinished || row.auctionCanceled || row.auctionFinished) return null;
  if (detail.stage && detail.stage.id !== row.biddingStageId) return null;

  const tenderNumber = (detail.processNumber || row.auctionNumber || "").trim();
  const title = (detail.simpleDescription || row.simpleDescription || "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!tenderNumber || !title) return null;

  const publicationDate = iso(detail.publishedDate) ?? iso(detail.startDateTimeToSendProposal);
  if (!publicationDate) return null;
  // Proposals are taken until the dispute session opens; the portal leaves
  // endDateTimeToSendProposal empty for these processes and the session
  // start IS the deadline.
  const submissionDeadline = iso(detail.endDateTimeToSendProposal) ?? iso(detail.startDateTimeDispute ?? row.startDateTimeDispute);

  const rule = detail.rule?.description ?? "";
  const scopeType = scopeTypeOf(rule);
  const procedureType = cemigProcedureType(process);
  const buyer = buyerName(process);
  const segments = (detail.segments ?? []).map((segment) => segment.categoryName.trim()).filter(Boolean);
  // Segments go into the stored summary because the relevance rules read
  // them: "ESTRUTURA METÁLICA P/LINHA TRANSMISSÃO ATÉ 550kV" is what makes
  // "Torres Metálicas de Transmissão" transmission-grade.
  const summary = [
    `${title}.`,
    segments.length ? `Segmento: ${segments.join("; ")}.` : undefined,
    `${rule || "Processo eletrônico"} — ${buyer}.`,
    submissionDeadline ? "Propostas até a abertura da sessão de disputa." : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: "Brazil",
    governmentLevel: "public_company",
    scopeType,
    procedureType,
    tenderNumber,
    sourceName: CEMIG_SOURCE_NAME,
  });

  const slug = `cemig-${slugify(tenderNumber)}`;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Brazil",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    location: "MG",
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: CEMIG_SOURCE_NAME,
    sourceUrl: cemigProcessUrl(row.id),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
