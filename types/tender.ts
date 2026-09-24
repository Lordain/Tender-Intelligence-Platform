export type Locale = "es" | "en" | "zh";

export type LocalizedText = {
  es: string;
  en: string;
  zh: string;
};

export type TenderScopeType =
  | "equipment"
  | "services"
  | "equipment_services"
  | "works"
  | "consulting"
  /**
   * The SOURCE published no procurement category — not a sixth kind of
   * contract, a statement that this field is unknown (migration 0056).
   *
   * Added 2026-09-24 for Chile, whose two doors carry no category field at
   * all: both mappers were writing "services", so a motorway and seven PPP
   * lots claimed to be service contracts and the 采购类型 filter returned
   * nothing for 工程 while works were sitting in the data. Nothing in
   * lib/relevance.ts reads this value positively — every rule there tests for
   * a specific category ("works", "consulting", "equipment") — so a row moving
   * from "services" to "unknown" is classified exactly as before.
   */
  | "unknown";

export type TenderStatus =
  | "planned"
  | "open"
  | "clarification"
  | "submission_closed"
  | "awarded"
  | "cancelled";

export type GovernmentLevel =
  | "federal"
  | "state"
  | "municipal"
  | "public_company"
  | "private";

export type TenderRequirement = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  mandatory: boolean;
  sourceReference?: string;
};

export type TenderKeyDate = {
  id: string;
  type:
    | "publication"
    | "site_visit"
    | "questions_deadline"
    | "clarification"
    | "submission"
    | "opening"
    | "award"
    | "contract_signing"
    /**
     * The date a standing procurement mechanism stops being valid — NOT a bid
     * deadline. PEMEX's Concursos Abiertos carry one (`vencimiento`, routinely
     * a year or two out); see supabase/migrations/0044_key_date_validity_end.sql.
     */
    | "validity_end";
  date: string;
  mandatory?: boolean;
  notes?: LocalizedText;
  /**
   * Where in the bid document this date was read (migration 0047) — set only
   * on a date the Layer 2 extraction produced, which is also what makes it
   * distinguishable from a feed-supplied or hand-entered one. Admin-facing:
   * the public 关键日期 timeline is a schedule and shows no page numbers.
   */
  sourceReference?: string;
};

export type TenderRiskLevel = "low" | "medium" | "high" | "critical";

export type TenderRisk = {
  id: string;
  level: TenderRiskLevel;
  title: LocalizedText;
  description: LocalizedText;
  sourceReference?: string;
};

/**
 * Pre-Screening classification: not every tender gets full analysis depth
 * (AI cost control) or a place in the default feed. "flagship"/
 * "significant" surface by default; "standard" is available but
 * de-emphasized; "excluded" (routine services — cleaning, catering,
 * security guards, etc.) is hidden from the default feed but its metadata
 * is kept, not deleted, for future market statistics.
 *
 * The underlying classification is the same for every locale, but how
 * it's framed to the reader is not: the Chinese UI frames this as
 * relevance to Chinese enterprises bidding overseas ("中资出海相关度"),
 * while English/Spanish frame the identical tier as project
 * significance/scale ("Flagship Project") — deliberately without
 * "China"-specific language, per product decision. `label`/`reason` carry
 * that per-locale framing directly since they're already LocalizedText.
 */
export type TenderRelevanceTier = "flagship" | "significant" | "standard" | "excluded";

export type TenderRelevance = {
  tier: TenderRelevanceTier;
  label: LocalizedText;
  reason: LocalizedText;
};

/**
 * Whether a foreign bidder can participate at all — "Carácter del
 * procedimiento" in the real Compras MX exports (contracts and open
 * tenders alike; both confirmed to use the same three literal values).
 * Surfaced as-is (translated, not interpreted) rather than asserting
 * which countries a given treaty covers — that's a legal question this
 * platform doesn't have a verified source for yet, and getting it wrong
 * would be actively misleading for a bid/no-bid decision.
 */
export type TenderParticipationScope = "national" | "international_treaty" | "international_open";

/** The /admin/documents-needed worklist row shape — see lib/db/tenders.ts's fetchTendersNeedingDocumentsFromDb(). Kept here (not in that server-only file) so client components can import the type without pulling in server-only code. */
export type TenderNeedingDocuments = {
  slug: string;
  /**
   * The procedure number the GOVERNMENT portal uses, e.g.
   * "LO-77-005-...-N-16" or "IA-38-91Q-...". What an admin types into Compras
   * MX or SEACE to find this tender, and what the downloaded file is named
   * after — unlike the slug, which is ours and means nothing on the far side.
   */
  tenderNumber: string;
  title: LocalizedText;
  country: string;
  estimatedValue?: number;
  currency?: string;
  relevanceTier: TenderRelevanceTier;
  relevanceLabel: LocalizedText;
  publicationDate: string;
  sourceUrl: string;
  /** Which connector produced this row — the /admin/documents-needed 来源 filter, since only some sources carry auto-downloadable document links. */
  sourceName: string;
  status: TenderStatus;
  /**
   * How many official bid-document download links ingestion captured for this
   * tender (supabase/migrations/0042_tender_document_links.sql). 0 means the
   * files have to be fetched by hand — true for every Compras MX row (anti-bot
   * gated) and for anything ingested before those links were recorded.
   */
  documentLinkCount: number;
  /**
   * When an admin marked "I already downloaded this one's documents"
   * (supabase/migrations/0043_documents_downloaded_at.sql). Undefined means
   * not downloaded. Distinct from documents_unavailable, which removes the row
   * from the worklist entirely — this row is still waiting for its files to be
   * uploaded, it just no longer needs fetching.
   */
  documentsDownloadedAt?: string;
};

export type Tender = {
  id: string;
  slug: string;
  /**
   * Stable, opaque token used only in public-facing URLs. The internal slug
   * above intentionally remains the ingestion/admin identity because it is
   * derived from source procedure numbers and must never be exposed in a
   * visitor URL. Database rows always have this after migration 0050;
   * ingestion objects may omit it before they are written.
   */
  publicSlug?: string;
  tenderNumber: string;
  title: LocalizedText;
  /**
   * The title published to guests, crawlers and search snippets — country +
   * industry + works type, with the place names, agency names and
   * procurement codes stripped (migration 0053).
   *
   * Exists because `title.zh` is deliberately NOT safe to publish: the
   * translation prompt keeps the source proper noun in full-width
   * parentheses (马塔德罗（Matadero）泵站) so a bidder can match the title
   * against a map and the bid documents. That is right for a subscriber and
   * is a ready-made search key back to the source portal for everyone else.
   *
   * Undefined for a row the generator has not reached yet; every public
   * surface reads it through publicTitleOf(), which falls back to title.zh.
   */
  titleZhPublic?: string;
  /**
   * A condensed form of `title.zh` for MEMBERS — the string shown in list
   * rows and as the detail-page heading (migration 0054).
   *
   * A source title is an administrative sentence, and a faithful translation
   * of one is an administrative sentence in Chinese: 「公开招标（电子）第
   * 023/2026号——专业工程公司承建专业社会救助参考中心（CREAS），位于塞乌阿祖尔
   * 社区（Bairro Céu Azul）」. Correct, and unreadable as a list row.
   *
   * Derived rather than done by fixing the translation prompt, because
   * `title.zh` has a second job: it is what a subscriber matches against the
   * bid documents, which is why the prompt carries every reference code
   * through unchanged and why findDroppedIdentifiers() guards that. A
   * condensing prompt is exactly the thing that quietly drops one. Keeping
   * both means the archival title is never at risk and the short one can be
   * cleared and regenerated freely.
   *
   * Keeps the place names and the full-width parentheses — a member is meant
   * to be able to find this procurement. That is the whole difference from
   * `titleZhPublic`. Undefined until generated; read through shortTitleOf(),
   * which falls back to title.zh.
   */
  titleZhShort?: string;
  summary: LocalizedText;
  /**
   * The summary published to guests, crawlers and search snippets — what is
   * being procured and roughly at what scale, with place names, agency and
   * facility names, procurement codes and exact quantities removed
   * (migration 0054).
   *
   * `summary.zh` is a faithful translation of the source `objeto`, and every
   * portal we ingest restates the project name, the municipality and often
   * the street there. Publishing it under a redacted title undoes the
   * redaction — in the card, the detail page, the meta description and the
   * JSON-LD description at once.
   *
   * Undefined until generated. Unlike `titleZhPublic` this FAILS CLOSED:
   * publicSummaryOf() returns undefined rather than falling back to
   * `summary.zh`, and the public projections then show the same generic
   * sentence they already show for an untranslated row. The title could not
   * do that — it is the <h1> and the <title> — but the summary block is
   * already conditional, so there is no reason to keep publishing the real
   * one while a backfill runs.
   */
  summaryZhPublic?: string;
  /**
   * One or two Chinese sentences (≤100 characters) answering "what is this
   * tender, in one line" — generated by Layer 2 document analysis
   * alongside qualifications/experienceRequirements/requiredDocuments/
   * risks (see lib/ingestion/extract-requirements.ts's ExtractionSchema),
   * shown on the public tender page directly above 资质要求. Distinct from
   * `summary` above (a longer, source-derived paraphrase) — zh-only by
   * design, same convention as qualifications/risks text (see extract-
   * requirements.ts's header comment on why those generate zh only), so a
   * plain string rather than LocalizedText. Undefined for a tender that
   * has never had a document analyzed (or one analyzed before this field
   * existed) — the public page simply omits the block in that case.
   */
  oneLineSummary?: string;
  buyer: string;
  country: string;
  governmentLevel: GovernmentLevel;
  /**
   * One or more industry tags (see lib/industry.ts's IndustryKey union) —
   * a tender can genuinely span more than one (e.g. a power plant's
   * SCADA/telecom upgrade is both "energy" and "ict_telecom"), so this is
   * an array rather than a single category.
   */
  industries: string[];
  subcategory?: string;
  scopeType: TenderScopeType;
  procedureType: string;
  /**
   * "Carácter del procedimiento" where the source states it — INFORMATIONAL
   * ONLY, by explicit decision (user, 2026-09-12: Nacional 不是一个筛选屏蔽条件).
   *
   * It is shown on the tender detail page and nowhere else: classifyRelevance()
   * does not read it, and no list filter is derived from it. Raised as a
   * question because the real distribution is lopsided — 16,896 NACIONAL vs
   * 5,420 INTERNACIONAL ABIERTO and 1,281 BAJO TRATADOS across the full
   * 23,597-row 2025 Compras MX contracts export (see
   * lib/ingestion/heuristics.ts).
   *
   * The question was raised on the premise that NACIONAL puts a tender out of
   * reach of this platform's readers, and that premise was wrong: a Chinese
   * enterprise can hold a Mexican entity, or bid with a Mexican partner, and
   * either route is a national supplier. What the Carácter restricts is WHO
   * MAY SIGN, not which companies can pursue the work — so it is a fact about
   * how to structure a bid, which is the reader's call, not a fact about
   * whether the opportunity exists.
   *
   * So do not turn this into an exclude rule or a tier demotion without
   * asking again. Note also that the LicitIA bulk source carries no Carácter
   * column at all (licitia-vigente-mapper.ts), so any rule built on it would
   * apply to part of the Mexican feed and silently skip the rest.
   */
  participationScope?: TenderParticipationScope;
  publicationDate: string;
  /**
   * True when publicationDate is a stand-in (the time this platform first
   * ingested the tender) rather than a real government-published date —
   * some real sources (e.g. Compras MX's "Difusión de procedimientos"
   * open-tenders export, and Proyectos Estratégicos MX which reuses that
   * same mapper) simply don't carry a publication-date column, confirmed
   * against real captured files (see lib/ingestion/README.md). Lets the
   * UI show an honest "收录日期" instead of implying it's the real
   * government-published date — real, user-caught confusion (2026-09-04)
   * when a tender's shown date didn't match the source portal's.
   * Undefined/false means publicationDate is a real captured value.
   */
  publicationDateIsEstimated?: boolean;
  submissionDeadline?: string;
  awardDate?: string;
  /**
   * Deep link to this tender's page on the source portal (migration 0048),
   * entered by an admin when they paste its schedule — Peru's ficha URL is
   * keyed by a UUID the OCDS record does not carry, so nothing can derive it.
   * Admin-facing only; the public pages link `sourceUrl`.
   */
  fichaUrl?: string;
  /** Winning supplier/contractor name — only meaningful once a tender is awarded, from a real source ("Proveedor o contratista" in the Compras MX contracts export). */
  awardedTo?: string;
  /** Actual awarded/contract amount — distinct from estimatedValue (the pre-tender budget estimate, which a real award can differ from). No ingestion source supplies this yet; admin-entered only. */
  awardedValue?: number;
  estimatedValue?: number;
  currency?: string;
  /**
   * Contract duration in days, read from a STRUCTURED source field rather
   * than parsed out of prose — currently only Colombia SECOP II's
   * `duracion`/`unidad_de_duracion` (see colombia-mapper.ts). Persisted
   * (tenders.structured_duration_days, migration 0029) purely so the
   * relevance classifier gets the same value at import and at reclassify:
   * it feeds SHORT_DURATION_DAYS/LONG_DURATION_DAYS in lib/relevance.ts,
   * where >= 360 days promotes to flagship, and before it had a column the
   * reclassify path silently demoted those rows. Not rendered anywhere.
   */
  structuredDurationDays?: number;
  location?: string;
  status: TenderStatus;
  qualifications: TenderRequirement[];
  experienceRequirements: TenderRequirement[];
  requiredDocuments: TenderRequirement[];
  keyDates: TenderKeyDate[];
  risks: TenderRisk[];
  relevance: TenderRelevance;
  /**
   * True once an admin has manually set `relevance` via the edit form
   * (app/admin/tenders/[slug]) — protects the classification from being
   * silently reverted the next time this same tender is re-ingested from
   * its original source (upsertTendersBatched() skips relevance_tier/
   * label/reason for a protected row instead of overwriting it with a
   * freshly computed classifyRelevance() result). Per the user's explicit
   * request (2026-09-04): "以后重新入库时如果发现这条标书被人工改过分类，
   * 就跳过自动覆盖、保留你的手动选择". An admin can un-protect a row from
   * the same edit form.
   */
  relevanceManuallyOverridden?: boolean;
  /**
   * True when an admin picked this tender to show for free on the homepage
   * (app/page.tsx) once the paywall is on — see the "homepage_featured"
   * column added 2026-09-04. Manually-picked tenders are shown first (most
   * recent first); if fewer than the configured count are picked, the
   * homepage fills the rest with the next most recent tenders automatically
   * so it never looks sparse.
   */
  homepageFeatured?: boolean;
  /**
   * True when an admin dismissed this tender from the /admin/documents-
   * needed worklist via "标记为无法获取" — for sources with no automated
   * attachment path at all (e.g. Colombia's CAPTCHA-gated SECOP II detail
   * page), a tender would otherwise sit in that worklist forever with no
   * way to mark "not obtainable" (2026-09-05). Never affects relevance;
   * an admin can un-set it from this same edit form.
   */
  documentsUnavailable?: boolean;
  sourceName: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The exact tender fields that may cross the server/client boundary for an
 * unauthenticated or non-entitled detail view. Keep this as an explicit
 * allow-list: adding a field to Tender must never make it public by accident.
 */
/**
 * The guest-facing contract. Everything a visitor, a search crawler and an
 * assistant reading the page on a visitor's behalf are allowed to see —
 * these are the same audience, because none of them sends a session cookie.
 *
 * Three fields that look missing are missing on purpose (2026-09-19). They
 * are the values precise enough to serve as a search key back to the source
 * notice, which is how a reader reaches the official portal without ever
 * subscribing:
 *
 * - `estimatedValue` is replaced by `estimatedValueBand`. An exact figure is
 *   the strongest fingerprint a tender has — stronger than its name, since
 *   $47,382,915 matches exactly one row on earth.
 * - `location` is gone entirely, per the user's explicit instruction
 *   (2026-09-19: 这个无论如何需要隐藏). `country` deliberately stays: it is a
 *   core SEO keyword and far too coarse to identify anything.
 * - `submissionDeadline` carries "YYYY-MM", not a day. `publicationDate`
 *   keeps its day: it is a weak key (hundreds of notices share one) and a
 *   real freshness signal, where the deadline is the value a bidder acts on
 *   and the one the subscription sells. See toPublicTenderDetail.
 *
 * Everything the paywall already withheld — the original-language title, the
 * publishing body, the procedure number, key dates, requirements, risks and
 * the source URL — was never in this type and must not be added to it.
 */
export type PublicTenderDetail = Pick<
  Tender,
  | "country"
  | "governmentLevel"
  | "industries"
  | "scopeType"
  | "procedureType"
  | "participationScope"
  | "publicationDate"
  | "publicationDateIsEstimated"
  | "submissionDeadline"
  | "currency"
  | "status"
> & {
  publicSlug: string;
  titleZh: string;
  summaryZh: string;
  /** A USD range containing the real budget, or null when there is none to show. */
  estimatedValueBand: string | null;
  /**
   * 项目规模, as a pill beside the industries (user, 2026-09-20: 项目详情页，
   * 增加项目规模和项目类型的标签).
   *
   * The TIER only. `relevance` also carries `reason` — a paragraph written
   * for the admin screens that names the rule that fired and its thresholds
   * by number — and this type is the whitelist that keeps such a field from
   * reaching a public page by accident. The tier itself is a band
   * (大型/中型/常规), already a public filter control on /tenders, so it
   * reveals nothing a visitor could not already derive; the exact budget is
   * still redacted to estimatedValueBand above.
   */
  relevanceTier: TenderRelevanceTier;
};
