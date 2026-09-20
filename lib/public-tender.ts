import type { PublicTenderDetail, Tender } from "@/types/tender";
import { requirePublicTenderSlug } from "@/lib/public-tender-url";
import { estimatedValueBand, toMonthPrecision, toMonthPrecisionOptional } from "@/lib/public-redaction";
import { GENERIC_PUBLIC_SUMMARY, publicSummaryOf, publicTitleOf } from "@/lib/public-title";

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

  return {
    publicSlug: requirePublicTenderSlug(tender),
    // Imported rows temporarily mirror the source text into `zh` before the
    // translation job runs. Never mistake that placeholder for approved
    // public Chinese copy, because it would expose the protected original.
    // publicTitleOf(), not title.zh. The translated title keeps the source
    // proper noun in parentheses on purpose (马塔德罗（Matadero）泵站) so a
    // subscriber can match it against the bid documents — which is exactly
    // what makes it a search key back to the source portal for everyone
    // else. Falls back to title.zh for a row the generator has not reached.
    titleZh: hasChineseTitle ? publicTitleOf(tender) : "政府采购项目",
    // publicSummaryOf(), never summary.zh — and no fallback to it.
    //
    // summary.zh is a faithful translation of the source `objeto`, and every
    // portal we ingest restates the project name, the municipality and often
    // the street there. Published under a redacted title it undid the
    // redaction completely, in four places at once: this page, the card, the
    // meta description (the search-result snippet, read without the page ever
    // being opened) and the JSON-LD description. A row whose public summary
    // has not been generated shows the placeholder instead; unlike the title,
    // this block is optional everywhere it renders, so failing closed costs a
    // sentence rather than a page.
    summaryZh: publicSummaryOf(tender) ?? GENERIC_PUBLIC_SUMMARY,
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
