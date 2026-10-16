/**
 * A gov.sr 「Aanbestedingen」 notice (suriname-notice.ts) → a Tender, for
 * Suriname (user, 2026-10-16: 苏里南做，先只在后台可见). Added staged: nothing
 * is written until the dry run (scripts/cron-suriname.ts) has been read and
 * the rules agreed.
 *
 * Every notice maps; whether it is kept is the general rules' call
 * (classifyStoredTender), as for any country. No post states an amount.
 */
import type { Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { SURINAME_TENDERS_PAGE } from "@/lib/ingestion/connectors/suriname-govsr-live";
import type { SurinameMethod, SurinameNotice } from "@/lib/ingestion/suriname-notice";

export const SURINAME_SOURCE_NAME = "Suriname — gov.sr Aanbestedingen (Ministerie van Financiën en Planning)";

/** The same labels as Guyana's (lib/relevance-guyana.ts), so both read alike. */
export const SURINAME_PROCEDURE_LABEL: Record<Exclude<SurinameMethod, null>, string> = {
  icb: "International Competitive Bidding (ICB)",
  ncb: "National Competitive Bidding (NCB)",
  eoi: "Request for Expressions of Interest (consulting)",
};

export function surinameScopeType(notice: Pick<SurinameNotice, "method" | "title" | "text">): TenderScopeType {
  if (notice.method === "eoi" || /\bconsult(?:ant|ing|ancy)\b/i.test(notice.title)) return "consulting";
  const subject = `${notice.title} ${notice.text.slice(0, 600)}`;
  // "Supply of Equipment for School Renovation Works" buys equipment.
  if (/^(?:the )?(?:supply|purchase|procurement of goods)\b/i.test(notice.title)) return "equipment";
  if (/design and build|\b(?:re)?construction\b|renovation|rehabilitation|\bworks\b|infrastructure/i.test(notice.title)) return "works";
  if (/\bsupply\b|\bpurchase\b|procurement of goods|equipment|hardware|machinery|furniture|books|fertili[sz]er/i.test(subject)) return "equipment";
  return "unknown";
}

export function mapSurinameNoticeToTender(notice: SurinameNotice, now: Date = new Date()): Tender {
  const title = notice.title;
  const buyer = notice.beneficiary ? `Ministry of Finance and Planning, for the ${notice.beneficiary}` : "Ministry of Finance and Planning (Republic of Suriname)";
  const scopeType = surinameScopeType(notice);
  const procedureType = notice.method ? SURINAME_PROCEDURE_LABEL[notice.method] : "Open tender (method not stated in the notice)";
  const paramaribo = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone: "America/Paramaribo", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const summary = [
    `${title}.`,
    `Procuring entity: ${buyer}.`,
    notice.scope ? `Scope: ${notice.scope}` : undefined,
    notice.method ? `${SURINAME_PROCEDURE_LABEL[notice.method]}.` : undefined,
    notice.financier === "Social Bond" ? "Financed from the Republic of Suriname's February 2026 Social Bond (priority social projects)." : notice.financier ? `Financed by the ${notice.financier}.` : undefined,
    notice.deadline ? `${notice.method === "eoi" ? "Expressions of interest" : "Bids"} are due by ${paramaribo(notice.deadline)} (Paramaribo time).` : undefined,
    notice.method === "eoi" ? undefined : "The bidding documents are requested by email from the procuring office named in the notice; bids in English.",
    "Published on gov.sr (Aanbestedingen).",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: "Suriname",
    governmentLevel: "federal",
    scopeType,
    procedureType,
    tenderNumber: `GOVSR-${notice.postId}`,
    sourceName: SURINAME_SOURCE_NAME,
  });

  const slug = `suriname-govsr-${slugify(String(notice.postId))}`;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: notice.publishedAt }];
  if (notice.preBidMeeting) keyDates.push({ id: `${slug}-prebid`, type: "clarification", date: notice.preBidMeeting });
  if (notice.clarificationsUntil) keyDates.push({ id: `${slug}-questions`, type: "questions_deadline", date: notice.clarificationsUntil });
  if (notice.deadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: notice.deadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: `GOVSR-${notice.postId}`,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Suriname",
    governmentLevel: "federal",
    industries,
    scopeType,
    procedureType,
    publicationDate: notice.publishedAt,
    ...(notice.deadline ? { submissionDeadline: notice.deadline } : {}),
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: SURINAME_SOURCE_NAME,
    sourceUrl: notice.url || SURINAME_TENDERS_PAGE,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
