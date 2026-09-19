import type { PublicTenderDetail, Tender } from "@/types/tender";
import { requirePublicTenderSlug } from "@/lib/public-tender-url";
import { estimatedValueBand, toMonthPrecision, toMonthPrecisionOptional } from "@/lib/public-redaction";

/**
 * Convert a full tender to the public search landing-page contract.
 *
 * This is deliberately a whitelist rather than object spreading followed by
 * deletion. The latter leaks whenever Tender gains a new protected field;
 * this function requires a conscious decision before anything new is sent to
 * the public client component or embedded in its React payload.
 */
export function toPublicTenderDetail(tender: Tender): PublicTenderDetail {
  const hasChineseTitle = tender.title.zh.trim() && tender.title.zh.trim() !== tender.title.es.trim();
  const hasChineseSummary = tender.summary.zh.trim() && tender.summary.zh.trim() !== tender.summary.es.trim();

  return {
    publicSlug: requirePublicTenderSlug(tender),
    // Imported rows temporarily mirror the source text into `zh` before the
    // translation job runs. Never mistake that placeholder for approved
    // public Chinese copy, because it would expose the protected original.
    titleZh: hasChineseTitle ? tender.title.zh : "政府采购项目",
    summaryZh: hasChineseSummary
      ? tender.summary.zh
      : "这是一个政府采购项目，可先查看采购方式、参与范围、所属国家和计划交标时间。",
    country: tender.country,
    governmentLevel: tender.governmentLevel,
    industries: tender.industries,
    scopeType: tender.scopeType,
    procedureType: tender.procedureType,
    participationScope: tender.participationScope,
    // Deliberately month-precision, and deliberately redacted HERE rather
    // than in the view. This projection feeds generateMetadata() and the
    // JSON-LD as well as the visitor page, so redacting at the single point
    // they share is what keeps the three consistent — and a crawler reads
    // all three.
    publicationDate: toMonthPrecision(tender.publicationDate),
    publicationDateIsEstimated: tender.publicationDateIsEstimated,
    submissionDeadline: toMonthPrecisionOptional(tender.submissionDeadline),
    // The band, never the figure. `currency` stays so the page can still say
    // which rate the USD range was converted at; the source currency is
    // implied by the country anyway, so it identifies nothing on its own.
    estimatedValueBand: estimatedValueBand(tender.estimatedValue, tender.currency),
    currency: tender.currency,
    status: tender.status,
  };
}
