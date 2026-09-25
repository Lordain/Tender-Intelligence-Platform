import type { Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { PETRONECT_SOURCE_NAME, petronectProcedureType, petronectSubjectKind } from "@/lib/relevance-petronect";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { PETRONECT_LIST_URL, petronectAttachmentUrl, type PetronectOpportunity } from "@/lib/ingestion/connectors/petronect-live";

export { PETRONECT_SOURCE_NAME };

/**
 * Petronect dates are plain `YYYY-MM-DD` + `HH:MM:SS` with no zone. The header
 * service names the zone per opportunity ("Brazil - Distrito Federal",
 * "Brazil - São Paulo", "Brazil - Sergipe", "Brazil - Minas Gerais" on the
 * 2026-09-25 sample), and every one of those is UTC-3 all year — Brazil has
 * not observed daylight saving since 2019 — so Brasília time is stated rather
 * than a header fetched per row.
 */
const BRASILIA_OFFSET = "-03:00";

function parsePetronectDate(day: string | undefined, time?: string): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith("0000")) return undefined;
  // A bare date is anchored at noon: at midnight Brasília it would read as the
  // previous day on the site, which renders days in Mexico City time (UTC-6).
  const clock = time && /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : "12:00:00";
  const parsed = new Date(`${day}T${clock}${BRASILIA_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * The earlier of the DOU notice and the start of the bidding period.
 *
 * POSTING_DATE is when Petrobras created the record internally, before anyone
 * outside could see it — 2026-05-05 for an opportunity whose DOU notice and
 * bidding period both opened on 2026-05-11. Using it would measure the
 * bidding window from a day no bidder could have acted on.
 */
function publicationDateOf(row: PetronectOpportunity): string | undefined {
  const candidates = [parsePetronectDate(row.DOU_PUBL_DATE), parsePetronectDate(row.START_DATE, row.START_HOUR)].filter(
    (value): value is string => value !== undefined,
  );
  return candidates.sort()[0];
}

/** "Petróleo Brasileiro S. A." → "Petróleo Brasileiro S.A. (Petrobras)"; the other companies keep the source's name. */
function buyerName(row: PetronectOpportunity): string {
  const name = row.COMPANY_DESC.trim().replace(/\bS\.\s*A\.?/g, "S.A.");
  return /^Petr[oó]leo Brasileiro/i.test(name) ? `${name} (Petrobras)` : name;
}

function scopeTypeOf(title: string): TenderScopeType {
  const kind = petronectSubjectKind(title);
  if (kind === "works") return "works";
  if (kind === "goods") return "equipment";
  return "services";
}

/** State codes of the delivery location, as the source lists them: "RJ", "RJ / SP". */
function locationOf(row: PetronectOpportunity): string | undefined {
  const codes = [...new Set((row.REGIONS ?? []).filter((r) => r.COUNTRY === "BR" && r.REGION).map((r) => r.REGION.trim()))];
  return codes.length > 0 ? codes.join(" / ") : undefined;
}

function keyDatesOf(id: string, publicationDate: string, deadline: string | undefined, opening: string | undefined): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [{ id: `${id}-publication`, type: "publication", date: publicationDate }];
  if (deadline) dates.push({ id: `${id}-submission`, type: "submission", date: deadline });
  if (opening && opening !== deadline) dates.push({ id: `${id}-opening`, type: "opening", date: opening });
  return dates;
}

export function petronectDocumentLinks(row: PetronectOpportunity, publishedAt: string | undefined): TenderDocumentLink[] {
  return (row.ANEXOS ?? [])
    .filter((file) => file.PHIO_OBJID)
    .map((file) => {
      const name = safeFileName(file.DESCRIPTION || file.PHIO_OBJID);
      const extension = /\.([a-z0-9]{2,4})$/i.exec(name)?.[1]?.toLowerCase();
      return {
        sourceUrl: petronectAttachmentUrl(file.PHIO_OBJID),
        fileName: name,
        ...(extension ? { format: extension } : {}),
        ...(publishedAt ? { publishedAt } : {}),
      };
    });
}

/**
 * One open Petronect opportunity → a Tender, or null when it is missing
 * something a row cannot be built without.
 */
export function mapPetronectOpportunityToTender(row: PetronectOpportunity, now: Date = new Date()): Tender | null {
  const tenderNumber = row.OPPORT_NUM?.trim();
  // DESC_OBJ_CONTRAT is the full object; OPPORT_DESCR is the same text cut at
  // ~40 characters with "..." appended, so it is only a fallback.
  const title = (row.DESC_OBJ_CONTRAT || row.OPPORT_DESCR || "").replace(/\s+/g, " ").trim();
  if (!tenderNumber || !title || !row.COMPANY_DESC) return null;

  const publicationDate = publicationDateOf(row);
  if (!publicationDate) return null;
  const submissionDeadline = parsePetronectDate(row.END_DATE, row.END_HOUR);
  const opening = parsePetronectDate(row.OPEN_DATE, row.OPEN_HOUR);

  const buyer = buyerName(row);
  const scopeType = scopeTypeOf(title);
  const procedureType = petronectProcedureType(row.DISPUTE_MODE, row.NAT_COVERAGE);
  const location = locationOf(row);

  const { industries, relevance } = classifyStoredTender({
    title,
    summary: title,
    buyer,
    country: "Brazil",
    governmentLevel: "public_company",
    scopeType,
    procedureType,
    tenderNumber,
    sourceName: PETRONECT_SOURCE_NAME,
  });

  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    slug: `petronect-${tenderNumber}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Brazil",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType,
    participationScope: row.NAT_COVERAGE === "I" ? "international_open" : "national",
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(location ? { location } : {}),
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: keyDatesOf(`petronect-${tenderNumber}`, publicationDate, submissionDeadline, opening),
    risks: [],
    relevance,
    sourceName: PETRONECT_SOURCE_NAME,
    sourceUrl: PETRONECT_LIST_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
