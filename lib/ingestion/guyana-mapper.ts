import type { Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { GUYANA_EPROCURE_LIST_URL, type GuyanaOpportunity } from "@/lib/ingestion/connectors/guyana-eprocure-live";
import { classifyStoredTender } from "@/lib/relevance";
import { guyanaTitleEstimateGyd, GUYANA_ICB_LABEL, GUYANA_NCB_LABEL, GUYANA_SOURCE_NAME, type GuyanaNoticeFacts } from "@/lib/relevance-guyana";

export { GUYANA_SOURCE_NAME };

/** Guyana is UTC-4 all year; the notices set submission and opening at 09:00 local on the opening day. */
const GEORGETOWN_OPENING = "T09:00:00-04:00";

/** The ten administrative regions, by the number the source writes ("Region 04"). */
const REGIONS: Record<number, string> = {
  1: "Barima-Waini",
  2: "Pomeroon-Supenaam",
  3: "Essequibo Islands-West Demerara",
  4: "Demerara-Mahaica",
  5: "Mahaica-Berbice",
  6: "East Berbice-Corentyne",
  7: "Cuyuni-Mazaruni",
  8: "Potaro-Siparuni",
  9: "Upper Takutu-Upper Essequibo",
  10: "Upper Demerara-Berbice",
};

export function guyanaLocation(regions: string[]): string | undefined {
  const named = regions
    .map((region) => Number(/(\d{1,2})/.exec(region)?.[1]))
    .filter((number) => REGIONS[number])
    .map((number) => `Region ${number} (${REGIONS[number]})`);
  return named.length > 0 ? [...new Set(named)].join("; ") : undefined;
}

/** "34-Ministry of Public Utilities and Aviation" → "Ministry of Public Utilities and Aviation". */
export function guyanaBuyer(agency: string): string {
  return agency.replace(/^\s*\d+\s*-\s*/, "").trim() || "Government of Guyana";
}

/**
 * The name as a title: whitespace collapsed, and the "1." an agency types in
 * front of a lot list dropped. Lots stay — "Lot 1-4" is part of what is being
 * bought. Private-use and zero-width characters go too: four GWI well-drilling
 * names of 2026-09-27 began with U+F076, a Word bullet that renders as a box.
 */
export function guyanaTitle(projectName: string): string {
  return projectName
    .replace(/[\uE000-\uF8FF\u200B-\u200D\u2060\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*\d{1,2}\.\s*/, "")
    .trim();
}

function scopeTypeOf(nature: string): TenderScopeType {
  const value = nature.toLowerCase();
  if (value.startsWith("works")) return "works";
  if (value.startsWith("goods")) return "equipment";
  if (value.startsWith("consult")) return "consulting";
  if (value.startsWith("services")) return "services";
  return "unknown";
}

export function guyanaDocumentLinks(opportunity: GuyanaOpportunity): TenderDocumentLink[] {
  const publishedAt = new Date(`${opportunity.advertisementDate}T12:00:00-04:00`).toISOString();
  return opportunity.documents.map((doc) => ({
    sourceUrl: doc.url,
    fileName: safeFileName(decodeURIComponent(doc.url.split("/").pop() ?? "advertisement.pdf")),
    documentType: doc.name,
    format: "pdf",
    publishedAt,
  }));
}

/** One advertised opportunity → a Tender. Every row maps; whether it is kept is the relevance tier's job. */
export function mapGuyanaOpportunityToTender(opportunity: GuyanaOpportunity, facts: GuyanaNoticeFacts, now: Date = new Date()): Tender {
  const title = guyanaTitle(opportunity.projectName);
  const buyer = guyanaBuyer(opportunity.agency);
  const scopeType = scopeTypeOf(opportunity.procurementNature);
  const competition = facts.competition === "international" ? GUYANA_ICB_LABEL : facts.competition === "national" ? GUYANA_NCB_LABEL : null;
  const procedureType = [opportunity.procurementMethod || "Open Tendered", competition].filter(Boolean).join(" — ");
  const location = guyanaLocation(opportunity.regions);
  const estimateGyd = guyanaTitleEstimateGyd(title);
  const summary = [
    `${title}.`,
    `Procuring entity: ${buyer}.`,
    competition ? `${competition}.` : undefined,
    facts.financier ? `Financed by the ${facts.financier}.` : undefined,
    location ? `Location: ${location}.` : undefined,
    opportunity.bidOpeningDate ? `Bids are submitted and opened at 09:00 on ${opportunity.bidOpeningDate} (Georgetown time).` : undefined,
    "Advertised on eprocure.gov.gy (National Procurement and Tender Administration Board).",
  ]
    .filter(Boolean)
    .join(" ");

  // Classified from the fields this row stores — the notice facts travel in
  // procedureType and the summary — so reclassify reaches the same tier
  // (guyanaFactsFromStoredFields in lib/relevance-guyana.ts).
  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: "Guyana",
    governmentLevel: "federal",
    scopeType,
    procedureType,
    tenderNumber: opportunity.projectId,
    ...(estimateGyd !== null ? { estimatedValue: estimateGyd, currency: "GYD" } : {}),
    sourceName: GUYANA_SOURCE_NAME,
  });
  const slug = `guyana-${slugify(opportunity.projectId)}`;
  const publicationDate = new Date(`${opportunity.advertisementDate}T12:00:00-04:00`).toISOString();
  const submissionDeadline = opportunity.bidOpeningDate ? new Date(`${opportunity.bidOpeningDate}${GEORGETOWN_OPENING}`).toISOString() : undefined;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: opportunity.projectId,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Guyana",
    governmentLevel: "federal",
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(estimateGyd !== null ? { estimatedValue: estimateGyd, currency: "GYD" } : {}),
    ...(location ? { location } : {}),
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: GUYANA_SOURCE_NAME,
    sourceUrl: opportunity.documents[0]?.url ?? GUYANA_EPROCURE_LIST_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
