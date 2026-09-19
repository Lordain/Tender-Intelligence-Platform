import type { LocalizedText, Tender, TenderRequirement, TenderRisk } from "@/types/tender";
import { requirePublicTenderSlug } from "@/lib/public-tender-url";
import { estimatedValueBand, toMonthPrecisionOptional } from "@/lib/public-redaction";
import { isObrasPorImpuestos } from "@/lib/obras-por-impuestos";
import { publicTitleOf } from "@/lib/public-title";

/**
 * What a <TenderCard> needs, and nothing else.
 *
 * The card used to take a whole `Tender`. It is a "use client" component, so
 * every field of every tender handed to it was serialized into the React
 * payload embedded in the HTML — including the ones the paywall exists to
 * protect: the original-language title, the publishing body, the source URL,
 * the procedure number and the ingestion slug. On app/page.tsx that put them
 * in the most-crawled page on the site, and on app/saved/page.tsx it put the
 * ENTIRE tender table there, behind a login prompt that only ran in the
 * browser (2026-09-19).
 *
 * That was also the leak the redaction work set out to close, in its most
 * direct form: the card rendered `title.es` as a visible reference line, so a
 * reader did not need an AI search or even a translation — the original
 * Spanish/Portuguese name of the project was on the homepage, ready to
 * paste into Google.
 *
 * So the card takes a projection now, built by the same whitelist discipline
 * as toPublicTenderDetail: adding a field to Tender must never widen what
 * this component publishes.
 */
export type TenderCardData = Pick<
  Tender,
  "id" | "country" | "industries" | "status" | "scopeType" | "currency"
> & {
  /**
   * The badge, not the source name it is derived from. Shipping `sourceName`
   * to render a boolean told the reader which portal to search — a real hint
   * in a platform whose whole value is knowing where to look.
   */
  isObrasPorImpuestos: boolean;
  publicSlug: string;
  /** Always safe Chinese display copy — never a mirrored source title. */
  titleZh: string;
  /**
   * The original-language title, for members only. This is the single most
   * direct route from one of our pages to the source portal, so it is absent
   * for guests rather than hidden from them.
   */
  titleOriginal?: string;
  summaryZh: string;
  /** Members only — the publishing body names the project almost as well as its title does. */
  buyer?: string;
  /** Members only. Exactly one of this and `estimatedValueBand` is ever set. */
  estimatedValue?: number;
  estimatedValueBand?: string | null;
  submissionDeadline?: string;
  oneLineSummary?: string;
  /**
   * One preview item per category rather than the whole array. These are
   * Layer 2 AI output about OUR analysis, not source text, so they carry no
   * identifier — but shipping four full arrays to render four lines was
   * sending the paywalled analysis in full to render a teaser of it.
   */
  qualification?: PreviewItem;
  experience?: PreviewItem;
  document?: PreviewItem;
  risk?: PreviewItem;
};

export type PreviewItem = { title: LocalizedText; strong: boolean };

function firstPreview(items: readonly TenderRequirement[]): PreviewItem | undefined {
  const picked = items.find((item) => item.mandatory) ?? items[0];
  return picked === undefined ? undefined : { title: picked.title, strong: picked.mandatory };
}

const RISK_PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 } as const;

function topRisk(risks: readonly TenderRisk[]): PreviewItem | undefined {
  const picked = risks.slice().sort((a, b) => RISK_PRIORITY[a.level] - RISK_PRIORITY[b.level])[0];
  return picked === undefined ? undefined : { title: picked.title, strong: picked.level === "critical" };
}

/**
 * Project one tender for a card.
 *
 * `memberView` defaults to false so a new caller publishes the safe shape by
 * default — the same fail-closed default as toTenderListItem, and for the
 * same reason: the failure mode of getting this wrong is a page that looks
 * correct while serving protected values into its own HTML.
 */
export function toTenderCardData(
  tender: Tender,
  options: { memberView?: boolean; includeAnalysisPreview?: boolean } = {},
): TenderCardData {
  const memberView = options.memberView ?? false;
  // The 投标重点预览 block is paywalled analysis that the homepage shows on
  // purpose — but only for the tenders an admin picked as free previews,
  // which is the same allow-list isHomepageFreePreviewSlug() enforces on the
  // detail page. The deadline ticker is not that list, so its rows would
  // otherwise have carried the analysis for a dozen extra tenders in the
  // payload to render a country, a title and a date. Off by default.
  const includeAnalysisPreview = options.includeAnalysisPreview ?? false;
  const translatedTitle = tender.title.zh.trim();
  const originalTitle = tender.title.es.trim();
  // An unreviewed row mirrors the source text into `zh` until the translation
  // job runs. Treat that as untranslated rather than publishing the original.
  const hasRealTranslation = translatedTitle !== "" && translatedTitle !== originalTitle;
  const translatedSummary = tender.summary.zh.trim();
  const hasRealSummary = translatedSummary !== "" && translatedSummary !== tender.summary.es.trim();

  return {
    id: tender.id,
    publicSlug: requirePublicTenderSlug(tender),
    titleZh: hasRealTranslation
      ? (memberView ? tender.title.zh : publicTitleOf(tender))
      : memberView ? `${tender.buyer}采购项目` : "政府采购项目",
    ...(memberView && hasRealTranslation ? { titleOriginal: tender.title.es } : {}),
    summaryZh: hasRealSummary
      ? tender.summary.zh
      : "这是一个政府采购项目，可先查看采购方式、参与范围、所属国家和计划交标时间。",
    ...(memberView ? { buyer: tender.buyer } : {}),
    country: tender.country,
    industries: tender.industries,
    status: tender.status,
    scopeType: tender.scopeType,
    ...(memberView
      ? { estimatedValue: tender.estimatedValue }
      : { estimatedValueBand: estimatedValueBand(tender.estimatedValue, tender.currency) }),
    currency: tender.currency,
    submissionDeadline: memberView
      ? tender.submissionDeadline
      : toMonthPrecisionOptional(tender.submissionDeadline),
    ...(includeAnalysisPreview
      ? {
        oneLineSummary: tender.oneLineSummary,
        qualification: firstPreview(tender.qualifications),
        experience: firstPreview(tender.experienceRequirements),
        document: firstPreview(tender.requiredDocuments),
        risk: topRisk(tender.risks),
      }
      : {}),
    isObrasPorImpuestos: isObrasPorImpuestos(tender),
  };
}
