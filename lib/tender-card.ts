import type { LocalizedText, Tender, TenderRequirement, TenderRisk } from "@/types/tender";
import { requirePublicTenderSlug } from "@/lib/public-tender-url";
import { estimatedValueBand, toMonthPrecisionOptional } from "@/lib/public-redaction";
import { isObrasPorImpuestos } from "@/lib/obras-por-impuestos";
import { GENERIC_PUBLIC_SUMMARY, publicSummaryOf, publicTitleOf, shortTitleOf } from "@/lib/public-title";

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
  /**
   * Absent when the card also carries `oneLineSummary`: the two say the same
   * thing twice on the one card that shows both (2026-09-20, the user:
   * 考虑跟一句话总结有点重复就不展示摘要了). Dropped at the projection rather
   * than hidden in the component, so it is out of the React payload too —
   * a "use client" component is handed this whole object regardless of what
   * it chooses to render.
   */
  summaryZh?: string;
  /** Members only — the publishing body names the project almost as well as its title does. */
  buyer?: string;
  /** Members only. Exactly one of this and `estimatedValueBand` is ever set. */
  estimatedValue?: number;
  estimatedValueBand?: string | null;
  submissionDeadline?: string;
  /**
   * Always the full day, for every audience. The publication date is a weak
   * key — every portal publishes hundreds of notices on the same day — and a
   * dateline is what tells a reader the listing is current; see
   * toPublicTenderDetail for the reasoning and for why the DEADLINE is the
   * one that keeps month precision.
   */
  publicationDate: string;
  /**
   * The stored date is when this platform first saw the tender, not when the
   * government published it, so the card must label it 收录日期 instead. Carried
   * rather than inferred because getting it wrong prints a date under a claim
   * the source never made.
   */
  publicationDateIsEstimated?: boolean;
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
  options: { memberView?: boolean; includeAnalysisPreview?: boolean; shopfront?: boolean; showOneLineSummary?: boolean } = {},
): TenderCardData {
  const memberView = options.memberView ?? false;
  /**
   * The homepage shopfront exception: show this card the way a member sees
   * it — the condensed title that keeps the place name, and the exact
   * submission deadline — without opening any other member field.
   *
   * ONE flag rather than one per field, deliberately, and the same reasoning
   * toTenderListItem's `memberView` comment gives: two independent options
   * would eventually be passed inconsistently by some third call site, and
   * the failure mode of that mistake is silent — a page that looks right
   * while serving protected values into its own HTML. Everything this opens,
   * it opens together, at one call site.
   *
   * Set on app/page.tsx and nowhere else (2026-09-20, the user: 首页(仅限首页)
   * ……都用订阅用户看到的项目名称, then 计划交标日期展示完整). The homepage is
   * the shopfront: a visitor who reads six interchangeable 墨西哥
   * 变电站扩建工程 rows with a month for a deadline has no reason to believe
   * there is a product behind them, and the free-preview cards there already
   * publish paywalled analysis on purpose for exactly that reason.
   *
   * It is a real, bounded cost and not a free win: these titles carry the
   * source proper noun, an exact deadline narrows a search, this page is the
   * one crawlers read most, and the ticker is NOT the admin's free-preview
   * allow-list. So it is scoped to one route and the dozen-odd rows that
   * route shows — every list row, every detail page and every other card
   * keeps publicTitleOf and month precision. Defaults to memberView so no
   * existing caller changes behaviour and a new one has to ask.
   */
  const shopfront = options.shopfront ?? memberView;
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
  // The 一句话总结 leads the 投标重点预览 block on the free-preview cards, and
  // it says what the summary underneath it says — twice, on the same card, in
  // two slightly different wordings. Computed here rather than in the view
  // because it decides whether `summaryZh` is projected at all, and because a
  // card whose one-line summary is missing must keep the summary rather than
  // end up with neither line.
  // Mirrors <TenderCard showOneLineSummary> — the caller that renders the
  // 一句话总结 is the caller that says so here, and only then is the summary
  // dropped as a duplicate of it.
  //
  // Keyed on this rather than on `includeAnalysisPreview`, which was wrong
  // and briefly shipped that way: /saved passes includeAnalysisPreview for a
  // member but renders the card WITHOUT showOneLineSummary, so tying the two
  // together left those cards with no description line at all — neither the
  // 一句话总结 (not rendered) nor the summary (no longer projected). The two
  // flags answer different questions: one is "may this card carry paywalled
  // analysis", the other is "does this card lead with the one-liner".
  //
  // It also keeps `oneLineSummary` out of the payload wherever nothing
  // renders it, which /saved was shipping to every member for nothing.
  const oneLineSummary = includeAnalysisPreview && (options.showOneLineSummary ?? false)
    ? (tender.oneLineSummary?.trim() === "" ? undefined : tender.oneLineSummary)
    : undefined;

  return {
    id: tender.id,
    publicSlug: requirePublicTenderSlug(tender),
    // A member gets the condensed title, not the full translation. The full
    // one is an administrative sentence — correct, archival, and unreadable
    // as a list row — and it is not lost: it stays in title.zh for the admin
    // screens and for regenerating this, and the original-language line below
    // is what actually matches the official documents anyway.
    titleZh: hasRealTranslation
      ? (shopfront ? shortTitleOf(tender) : publicTitleOf(tender))
      : memberView ? `${tender.buyer}采购项目` : "政府采购项目",
    ...(memberView && hasRealTranslation ? { titleOriginal: tender.title.es } : {}),
    // The guest branch reads the generated public summary and does NOT fall
    // back to summary.zh. That summary is a translation of the source
    // `objeto`, which restates the project name and the municipality — so
    // shipping it beside a redacted title handed back everything the title
    // had just removed, line-clamped in the UI but present in full in the
    // DOM and in this component's React payload.
    ...(oneLineSummary === undefined
      ? {
        summaryZh: memberView
          ? (hasRealSummary ? tender.summary.zh : GENERIC_PUBLIC_SUMMARY)
          : publicSummaryOf(tender) ?? GENERIC_PUBLIC_SUMMARY,
      }
      : {}),
    ...(memberView ? { buyer: tender.buyer } : {}),
    country: tender.country,
    industries: tender.industries,
    status: tender.status,
    scopeType: tender.scopeType,
    ...(memberView
      ? { estimatedValue: tender.estimatedValue }
      : { estimatedValueBand: estimatedValueBand(tender.estimatedValue, tender.currency) }),
    currency: tender.currency,
    submissionDeadline: shopfront
      ? tender.submissionDeadline
      : toMonthPrecisionOptional(tender.submissionDeadline),
    publicationDate: tender.publicationDate,
    ...(tender.publicationDateIsEstimated ? { publicationDateIsEstimated: true } : {}),
    ...(includeAnalysisPreview
      ? {
        oneLineSummary,
        qualification: firstPreview(tender.qualifications),
        experience: firstPreview(tender.experienceRequirements),
        document: firstPreview(tender.requiredDocuments),
        risk: topRisk(tender.risks),
      }
      : {}),
    isObrasPorImpuestos: isObrasPorImpuestos(tender),
  };
}
