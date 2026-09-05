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
  | "consulting";

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
    | "contract_signing";
  date: string;
  mandatory?: boolean;
  notes?: LocalizedText;
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
  title: LocalizedText;
  country: string;
  estimatedValue?: number;
  currency?: string;
  relevanceTier: TenderRelevanceTier;
  relevanceLabel: LocalizedText;
  publicationDate: string;
  sourceUrl: string;
};

export type Tender = {
  id: string;
  slug: string;
  tenderNumber: string;
  title: LocalizedText;
  summary: LocalizedText;
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
  /** Winning supplier/contractor name — only meaningful once a tender is awarded, from a real source ("Proveedor o contratista" in the Compras MX contracts export). */
  awardedTo?: string;
  /** Actual awarded/contract amount — distinct from estimatedValue (the pre-tender budget estimate, which a real award can differ from). No ingestion source supplies this yet; admin-entered only. */
  awardedValue?: number;
  estimatedValue?: number;
  currency?: string;
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
  sourceName: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};
