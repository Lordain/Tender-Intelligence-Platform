import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LocalizedText,
  Tender,
  TenderKeyDate,
  TenderNeedingDocuments,
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
  industries: string[];
  subcategory: string | null;
  scope_type: Tender["scopeType"];
  procedure_type: string;
  participation_scope: Tender["participationScope"] | null;
  publication_date: string;
  submission_deadline: string | null;
  award_date: string | null;
  awarded_to: string | null;
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
  industries, subcategory, scope_type, procedure_type, participation_scope,
  publication_date,
  submission_deadline, award_date, awarded_to, estimated_value, currency, location,
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
    industries: row.industries,
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
    industries: row.industries,
    subcategory: row.subcategory ?? undefined,
    scopeType: row.scope_type,
    procedureType: row.procedure_type,
    participationScope: row.participation_scope ?? undefined,
    publicationDate: row.publication_date,
    submissionDeadline: row.submission_deadline ?? undefined,
    awardDate: row.award_date ?? undefined,
    awardedTo: row.awarded_to ?? undefined,
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

/** PostgREST caps an unranged select at this many rows per request — a real, silent truncation confirmed against production data (exactly 1000 rows came back with no error), not a documentation-only concern. Must page with .range() to get everything. */
const SUPABASE_PAGE_SIZE = 1000;

/** Returns null when Supabase isn't configured, so callers can fall back to mock data. */
export async function fetchAllTendersFromDb(): Promise<Tender[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: TenderRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(TENDER_SELECT)
      .order("publication_date", { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to fetch tenders from Supabase:", error.message);
      return null;
    }

    const page = data as unknown as TenderRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows.map(toTender);
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

type DocumentsNeededRow = {
  slug: string;
  title: LocalizedText;
  country: string;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevance["tier"] | null;
  relevance_label: LocalizedText | null;
  publication_date: string;
  source_url: string;
  tender_documents: { id: string }[];
};

const DOCUMENTS_NEEDED_SELECT = `
  slug, title, country, estimated_value, currency, relevance_tier, relevance_label, publication_date, source_url,
  tender_documents ( id )
`;

/**
 * The `/admin/documents-needed` worklist: tenders that already passed
 * relevance screening (tier != "excluded" — no point sending anyone to
 * download attachments for a tender the default feed hides) but have no
 * `tender_documents` row yet. `.neq("relevance_tier", "excluded")` also
 * drops legacy rows with a null tier (Postgres's three-valued NULL logic
 * means NULL != 'excluded' isn't true) — an acceptable default here: this
 * is a "go download this" worklist, not the public feed, so a tender with
 * no computed tier yet is safer left out than sent to a human as if it
 * were confirmed worth the trip.
 */
export async function fetchTendersNeedingDocumentsFromDb(): Promise<TenderNeedingDocuments[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: DocumentsNeededRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(DOCUMENTS_NEEDED_SELECT)
      .neq("relevance_tier", "excluded")
      .order("publication_date", { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to fetch tenders needing documents from Supabase:", error.message);
      return null;
    }

    const page = data as unknown as DocumentsNeededRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows
    .filter((row) => row.tender_documents.length === 0)
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      country: row.country,
      estimatedValue: row.estimated_value ?? undefined,
      currency: row.currency ?? undefined,
      relevanceTier: row.relevance_tier ?? "standard",
      relevanceLabel: row.relevance_label ?? LABELS_FALLBACK,
      publicationDate: row.publication_date,
      sourceUrl: row.source_url,
    }));
}

/** Used only for the rare legacy row with a stored tier but somehow no stored label — classifyRelevance() itself always sets both together, so this is a defensive fallback, not an expected path. */
const LABELS_FALLBACK: LocalizedText = { en: "Standard Project", es: "Proyecto Estándar", zh: "常规项目" };
