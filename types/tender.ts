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

export type Tender = {
  id: string;
  slug: string;
  tenderNumber: string;
  title: LocalizedText;
  summary: LocalizedText;
  buyer: string;
  country: string;
  governmentLevel: GovernmentLevel;
  industry: string;
  subcategory?: string;
  scopeType: TenderScopeType;
  procedureType: string;
  publicationDate: string;
  submissionDeadline?: string;
  awardDate?: string;
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
  sourceName: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};
