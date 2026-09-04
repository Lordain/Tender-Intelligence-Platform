import "server-only";
import { cache } from "react";
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
  publication_date_is_estimated: boolean | null;
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
  relevance_manually_overridden: boolean | null;
  homepage_featured: boolean | null;
  source_name: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  // Optional: TENDER_LIST_SELECT (used for list/notification views that
  // never render qualifications/keyDates/risks — see fetchAllTendersFromDb)
  // omits these three joins entirely to skip their real DB cost across an
  // unbounded, full-table, thousands-of-rows query. Only
  // fetchTenderBySlugFromDb's TENDER_SELECT (one row) still joins them.
  tender_requirements?: RequirementRow[];
  tender_key_dates?: KeyDateRow[];
  tender_risks?: RiskRow[];
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

const TENDER_LIST_FIELDS = `
  id, slug, tender_number, title, summary, buyer, country, government_level,
  industries, subcategory, scope_type, procedure_type, participation_scope,
  publication_date, publication_date_is_estimated,
  submission_deadline, award_date, awarded_to, estimated_value, currency, location,
  status, relevance_tier, relevance_label, relevance_reason, relevance_manually_overridden,
  homepage_featured, source_name, source_url, created_at, updated_at
`;

/** One tender's full detail, including its qualifications/keyDates/risks — for fetchTenderBySlugFromDb (a single row). */
const TENDER_SELECT = `
  ${TENDER_LIST_FIELDS},
  tender_requirements ( id, kind, title, description, mandatory, source_reference, sort_order ),
  tender_key_dates ( id, type, date, mandatory, notes ),
  tender_risks ( id, level, title, description, source_reference )
`;

/** Same flat tender fields, without the three child-table joins — for fetchAllTendersFromDb, whose every real caller (list/notification views) only ever renders these flat fields, never qualifications/keyDates/risks (confirmed 2026-09-03 by grepping every consumer) — so there's no reason for an unbounded, thousands-of-rows query to also join and transfer three child tables' worth of rows per tender. toTender() defaults the omitted fields to empty arrays. */
const TENDER_LIST_SELECT = TENDER_LIST_FIELDS;

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
    buyer: row.buyer,
  });
}

function toTender(row: TenderRow): Tender {
  const requirements = [...(row.tender_requirements ?? [])].sort(
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
    publicationDateIsEstimated: row.publication_date_is_estimated ?? undefined,
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
    keyDates: (row.tender_key_dates ?? []).map(toKeyDate),
    risks: (row.tender_risks ?? []).map(toRisk),
    relevance: toRelevance(row),
    relevanceManuallyOverridden: row.relevance_manually_overridden ?? false,
    homepageFeatured: row.homepage_featured ?? false,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PostgREST caps an unranged select at this many rows per request — a real, silent truncation confirmed against production data (exactly 1000 rows came back with no error), not a documentation-only concern. Must page with .range() to get everything. */
const SUPABASE_PAGE_SIZE = 1000;

/**
 * Returns null when Supabase isn't configured, so callers can fall back
 * to mock data.
 *
 * Real user-reported slowness (2026-09-03) traced to two stacked
 * problems, both fixed here:
 * 1. Called TWICE per page load with no de-dup — once in app/layout.tsx
 *    just to feed the header's notification bell, and again in whichever
 *    page component also calls getAllTenders() — since this is a
 *    Supabase client call, not a plain `fetch()` Next.js already de-dupes
 *    on its own. Fixed by wrapping in React's `cache()`: every call
 *    within one request's render pass now reuses the same in-flight/
 *    resolved promise instead of re-querying.
 * 2. The query itself joined tender_requirements/tender_key_dates/
 *    tender_risks for EVERY row of this unbounded, full-table query —
 *    real cost (now the table has thousands of real rows from ingestion,
 *    not ~6 mock rows) for data no list/notification view actually
 *    renders (confirmed by grepping every real caller). Fixed by
 *    querying TENDER_LIST_SELECT (the flat fields only) instead of
 *    TENDER_SELECT — toTender() defaults the omitted child arrays to
 *    empty. fetchTenderBySlugFromDb (the single-tender detail page,
 *    which does need them) is untouched.
 */
export const fetchAllTendersFromDb = cache(async (): Promise<Tender[] | null> => {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: TenderRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(TENDER_LIST_SELECT)
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
});

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

/** The /admin/tenders list row shape — deliberately lighter than the full Tender (no nested requirements/key dates/risks joins) since this powers a table over 1000+ rows, not a detail view. */
export type AdminTenderListRow = {
  slug: string;
  tenderNumber: string;
  title: LocalizedText;
  buyer: string;
  country: string;
  status: Tender["status"];
  relevanceTier: TenderRelevance["tier"] | null;
  relevanceManuallyOverridden?: boolean;
  homepageFeatured?: boolean;
  estimatedValue?: number;
  currency?: string;
  publicationDate: string;
  publicationDateIsEstimated?: boolean;
  updatedAt: string;
};

type AdminTenderListDbRow = {
  slug: string;
  tender_number: string;
  title: LocalizedText;
  buyer: string;
  country: string;
  status: Tender["status"];
  relevance_tier: TenderRelevance["tier"] | null;
  relevance_manually_overridden: boolean | null;
  homepage_featured: boolean | null;
  estimated_value: number | null;
  currency: string | null;
  publication_date: string;
  publication_date_is_estimated: boolean | null;
  updated_at: string;
};

/** Returns null when Supabase isn't configured. Every tender, regardless of relevance tier — this is the admin's full inventory, not the public feed. */
export async function fetchAdminTenderListFromDb(): Promise<AdminTenderListRow[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: AdminTenderListDbRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, buyer, country, status, relevance_tier, relevance_manually_overridden, homepage_featured, estimated_value, currency, publication_date, publication_date_is_estimated, updated_at")
      .order("publication_date", { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to fetch admin tender list from Supabase:", error.message);
      return null;
    }

    const page = data as unknown as AdminTenderListDbRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows.map((row) => ({
    slug: row.slug,
    tenderNumber: row.tender_number,
    title: row.title,
    buyer: row.buyer,
    country: row.country,
    status: row.status,
    relevanceTier: row.relevance_tier,
    relevanceManuallyOverridden: row.relevance_manually_overridden ?? false,
    homepageFeatured: row.homepage_featured ?? false,
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
    publicationDate: row.publication_date,
    publicationDateIsEstimated: row.publication_date_is_estimated ?? undefined,
    updatedAt: row.updated_at,
  }));
}
