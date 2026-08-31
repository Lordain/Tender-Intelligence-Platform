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
  sourceName: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};
