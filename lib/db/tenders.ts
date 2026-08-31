import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LocalizedText,
  Tender,
  TenderKeyDate,
  TenderRelevance,
  TenderRequirement,
  TenderRisk,
} from "@/types/tender";
import { classifyRelevance } from "@/lib/relevance";

type TenderRow = {
  id: string;
  slug: string;
  tender_number: string;
  title: LocalizedText;
  summary: LocalizedText;
  buyer: string;
  country: string;
  government_level: Tender["governmentLevel"];
  industry: string;
  subcategory: string | null;
  scope_type: Tender["scopeType"];
  procedure_type: string;
  publication_date: string;
  submission_deadline: string | null;
  award_date: string | null;
  estimated_value: number | null;
  currency: string | null;
  location: string | null;
  status: Tender["status"];
  relevance_tier: TenderRelevance["tier"] | null;
  relevance_label: LocalizedText | null;
  relevance_reason: LocalizedText | null;
  source_name: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  tender_requirements: RequirementRow[];
  tender_key_dates: KeyDateRow[];
  tender_risks: RiskRow[];
};

type RequirementRow = {
  id: string;
  kind: "qualification" | "experience" | "document";
  title: LocalizedText;
  description: LocalizedText;
  mandatory: boolean;
  source_reference: string | null;
  sort_order: number;
};

type KeyDateRow = {
  id: string;
  type: TenderKeyDate["type"];
  date: string;
  mandatory: boolean | null;
  notes: LocalizedText | null;
};

type RiskRow = {
  id: string;
  level: TenderRisk["level"];
  title: LocalizedText;
  description: LocalizedText;
  source_reference: string | null;
};

const TENDER_SELECT = `
  id, slug, tender_number, title, summary, buyer, country, government_level,
  industry, subcategory, scope_type, procedure_type, publication_date,
  submission_deadline, award_date, estimated_value, currency, location,
  status, relevance_tier, relevance_label, relevance_reason,
  source_name, source_url, created_at, updated_at,
  tender_requirements ( id, kind, title, description, mandatory, source_reference, sort_order ),
  tender_key_dates ( id, type, date, mandatory, notes ),
  tender_risks ( id, level, title, description, source_reference )
`;

function toRequirement(row: RequirementRow): TenderRequirement {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    mandatory: row.mandatory,
    sourceReference: row.source_reference ?? undefined,
  };
}

function toKeyDate(row: KeyDateRow): TenderKeyDate {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    mandatory: row.mandatory ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toRisk(row: RiskRow): TenderRisk {
  return {
    id: row.id,
    level: row.level,
    title: row.title,
    description: row.description,
    sourceReference: row.source_reference ?? undefined,
  };
}

/** Legacy rows ingested before the relevance columns existed compute it on the fly rather than showing a gap. */
function toRelevance(row: TenderRow): TenderRelevance {
  if (row.relevance_tier && row.relevance_label && row.relevance_reason) {
    return { tier: row.relevance_tier, label: row.relevance_label, reason: row.relevance_reason };
  }
  return classifyRelevance({
    title: row.title.es,
    summary: row.summary.es,
    industry: row.industry,
    scopeType: row.scope_type,
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
  });
}

function toTender(row: TenderRow): Tender {
  const requirements = [...row.tender_requirements].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return {
    id: row.id,
    slug: row.slug,
    tenderNumber: row.tender_number,
    title: row.title,
    summary: row.summary,
    buyer: row.buyer,
    country: row.country,
    governmentLevel: row.government_level,
    industry: row.industry,
    subcategory: row.subcategory ?? undefined,
    scopeType: row.scope_type,
    procedureType: row.procedure_type,
    publicationDate: row.publication_date,
    submissionDeadline: row.submission_deadline ?? undefined,
    awardDate: row.award_date ?? undefined,
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
    location: row.location ?? undefined,
    status: row.status,
    qualifications: requirements.filter((r) => r.kind === "qualification").map(toRequirement),
    experienceRequirements: requirements.filter((r) => r.kind === "experience").map(toRequirement),
    requiredDocuments: requirements.filter((r) => r.kind === "document").map(toRequirement),
    keyDates: row.tender_key_dates.map(toKeyDate),
    risks: row.tender_risks.map(toRisk),
    relevance: toRelevance(row),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Returns null when Supabase isn't configured, so callers can fall back to mock data. */
export async function fetchAllTendersFromDb(): Promise<Tender[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("tenders")
    .select(TENDER_SELECT)
    .order("publication_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch tenders from Supabase:", error.message);
    return null;
  }

  return (data as unknown as TenderRow[]).map(toTender);
}

/** Returns undefined when configured but no row matches; null when Supabase isn't configured. */
export async function fetchTenderBySlugFromDb(
  slug: string,
): Promise<Tender | null | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("tenders")
    .select(TENDER_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch tender from Supabase:", error.message);
    return null;
  }

  if (!data) return undefined;
  return toTender(data as unknown as TenderRow);
}
