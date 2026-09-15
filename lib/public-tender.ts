import type { PublicTenderDetail, Tender } from "@/types/tender";

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
    slug: tender.slug,
    // Imported rows temporarily mirror the source text into `zh` before the
    // translation job runs. Never mistake that placeholder for approved
    // public Chinese copy, because it would expose the protected original.
    titleZh: hasChineseTitle ? tender.title.zh : `${tender.buyer}采购项目`,
    summaryZh: hasChineseSummary
      ? tender.summary.zh
      : `这是由${tender.buyer}发布的政府采购项目，可先查看采购方式、参与范围、地点和计划交标时间。`,
    buyer: tender.buyer,
    country: tender.country,
    governmentLevel: tender.governmentLevel,
    industries: tender.industries,
    scopeType: tender.scopeType,
    procedureType: tender.procedureType,
    participationScope: tender.participationScope,
    publicationDate: tender.publicationDate,
    publicationDateIsEstimated: tender.publicationDateIsEstimated,
    submissionDeadline: tender.submissionDeadline,
    estimatedValue: tender.estimatedValue,
    currency: tender.currency,
    location: tender.location,
    status: tender.status,
  };
}
