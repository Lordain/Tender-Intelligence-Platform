import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LocalizedText,
  Tender,
  TenderKeyDate,
  TenderNeedingDocuments,
  TenderRelevance,
  TenderRequirement,
  TenderRisk,
  TenderStatus,
} from "@/types/tender";
import { classifyStoredTender } from "@/lib/relevance";
import { deriveTenderStatus } from "@/lib/tender-status";

type TenderRow = {
  id: string;
  slug: string;
  tender_number: string;
  title: LocalizedText;
  summary: LocalizedText;
  one_line_summary: string | null;
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
  awarded_value: number | null;
  estimated_value: number | null;
  currency: string | null;
  location: string | null;
  status: Tender["status"];
  relevance_tier: TenderRelevance["tier"] | null;
  relevance_label: LocalizedText | null;
  relevance_reason: LocalizedText | null;
  relevance_manually_overridden: boolean | null;
  homepage_featured: boolean | null;
  documents_unavailable: boolean | null;
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

/**
 * NOTE: this string is sent verbatim as PostgREST's `?select=` parameter. It
 * is NOT SQL — it has no comment syntax, and a `--` line inside it is parsed
 * as part of a column name and fails the request (broke production for three
 * deploys, 2026-09-11). Keep every explanation out here.
 *
 * `tender_key_dates ( type, date )` is needed by deriveTenderStatus() for the
 * clarification-day rule (lib/tender-status.ts) — only the two columns that
 * rule reads, since this query pages over every tender.
 */
const TENDER_LIST_FIELDS = `
  id, slug, tender_number, title, summary, one_line_summary, buyer, country, government_level,
  industries, subcategory, scope_type, procedure_type, participation_scope,
  publication_date, publication_date_is_estimated,
  submission_deadline, award_date, awarded_to, awarded_value, estimated_value, currency, location,
  status, relevance_tier, relevance_label, relevance_reason, relevance_manually_overridden,
  homepage_featured, documents_unavailable, source_name, source_url, created_at, updated_at,
  tender_key_dates ( type, date )
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
  // Same entry point the ingestion and reclassify paths use, so a legacy row
  // is displayed with the tier those paths would give it rather than a third,
  // slightly different answer.
  return classifyStoredTender({
    title: row.title.es,
    summary: row.summary.es,
    buyer: row.buyer,
    country: row.country,
    governmentLevel: row.government_level,
    scopeType: row.scope_type,
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
    sourceName: row.source_name,
  }).relevance;
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
    oneLineSummary: row.one_line_summary ?? undefined,
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
    awardedValue: row.awarded_value ?? undefined,
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
    location: row.location ?? undefined,
    // Derived, not stored — see lib/tender-status.ts. The stored column
    // stays as the source reported it; this is what every surface displays.
    status: deriveTenderStatus(row.status, {
      submissionDeadline: row.submission_deadline,
      keyDates: row.tender_key_dates ?? [],
    }),
    qualifications: requirements.filter((r) => r.kind === "qualification").map(toRequirement),
    experienceRequirements: requirements.filter((r) => r.kind === "experience").map(toRequirement),
    requiredDocuments: requirements.filter((r) => r.kind === "document").map(toRequirement),
    keyDates: (row.tender_key_dates ?? []).map(toKeyDate),
    risks: (row.tender_risks ?? []).map(toRisk),
    relevance: toRelevance(row),
    relevanceManuallyOverridden: row.relevance_manually_overridden ?? false,
    homepageFeatured: row.homepage_featured ?? false,
    documentsUnavailable: row.documents_unavailable ?? false,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PostgREST caps an unranged select at this many rows per request — a real, silent truncation confirmed against production data (exactly 1000 rows came back with no error), not a documentation-only concern. Must page with .range() to get everything. */
const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_READ_ATTEMPTS = 3;

type SupabaseReadResult<T> = {
  data: T;
  error: { message: string } | null;
};

/** Retry short-lived network/gateway failures; only a successful read may enter Next's shared cache. */
async function retrySupabaseRead<T>(
  operation: () => PromiseLike<SupabaseReadResult<T>>,
  label: string,
): Promise<T> {
  let lastMessage = "unknown error";
  for (let attempt = 0; attempt < SUPABASE_READ_ATTEMPTS; attempt += 1) {
    const { data, error } = await operation();
    if (!error) return data;
    lastMessage = error.message;
    if (attempt < SUPABASE_READ_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
  throw new Error(`${label}: ${lastMessage}`);
}

type AwardedAnalysisProbeRow = {
  slug: string;
  tender_requirements: { id: string }[];
  tender_risks: { id: string }[];
};

/**
 * Slugs of "awarded" tenders that already have analysis logged (at least
 * one qualification/experience/document requirement or risk — the same
 * "标书分析结果" data the admin CRUD editors write). Scoped to
 * `status = "awarded"` only, so this stays a small, cheap query regardless
 * of how large the full tenders table gets — it never touches the
 * thousands of non-awarded rows the main list query already avoids
 * joining (see fetchAllTendersFromDb's own comment below).
 */
async function fetchAwardedSlugsWithAnalysis(supabase: SupabaseClient): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const data = await retrySupabaseRead(
      () => supabase
        .from("tenders")
        .select("slug, tender_requirements ( id ), tender_risks ( id )")
        .eq("status", "awarded")
        .range(from, from + SUPABASE_PAGE_SIZE - 1),
      "Failed to check awarded-tender analysis status from Supabase",
    );

    const page = data as unknown as AwardedAnalysisProbeRow[];
    for (const row of page) {
      if (row.tender_requirements.length > 0 || row.tender_risks.length > 0) slugs.add(row.slug);
    }
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }
  return slugs;
}

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
 *
 * Visibility rule (2026-09-05, explicit request): an "awarded" tender with
 * no analysis logged yet is hidden here. This is the one function behind
 * every public-facing surface — the main /tenders feed (via
 * lib/tenders.ts), the homepage teaser (app/page.tsx also calls
 * getAllTenders()), and the notification digest — so gating it here covers
 * all of them at once. Admin's own list (fetchAdminTenderListFromDb,
 * below) is a separate query with the SAME awarded-with-no-analysis
 * exception NOT applied — admins still need to see every awarded-but-
 * unanalyzed row to fix it.
 *
 * Retired 2026-09-11: a second visibility rule used to hide any Colombia
 * tender with no submission deadline. It was the indirect way of keeping
 * already-decided Contratación Directa / régimen especial processes out,
 * and it was wrong in both directions — it hid genuine open tenders whose
 * deadline datos.gov.co had not synced yet (18 of 37 rows on 2026-09-08,
 * 14 of them flagship), while still admitting plenty of directa rows that
 * happened to carry a date. The gate moved to ingestion instead, where it
 * can say what was meant: only Licitación pública modalidades enter the
 * system at all (isIngestedColombiaModalidad, lib/ingestion/colombia-mapper.ts).
 */
export const fetchAllTendersFromDb = cache(async (): Promise<Tender[] | null> => {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: TenderRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const data = await retrySupabaseRead(
      () => supabase
        .from("tenders")
        .select(TENDER_LIST_SELECT)
        .order("publication_date", { ascending: false })
        .range(from, from + SUPABASE_PAGE_SIZE - 1),
      "Failed to fetch tenders from Supabase",
    );

    const page = data as unknown as TenderRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  const awardedWithAnalysis = await fetchAwardedSlugsWithAnalysis(supabase);
  return rows
    .filter((row) => row.status !== "awarded" || awardedWithAnalysis.has(row.slug))
    .map(toTender);
});

/** Returns undefined when configured but no row matches; null when Supabase isn't configured. */
export async function fetchTenderBySlugFromDb(
  slug: string,
): Promise<Tender | null | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const data = await retrySupabaseRead(
    () => supabase
      .from("tenders")
      .select(TENDER_SELECT)
      .eq("slug", slug)
      .maybeSingle(),
    "Failed to fetch tender from Supabase",
  );

  if (!data) return undefined;
  return toTender(data as unknown as TenderRow);
}

/**
 * Full detail (including the three child-table joins) for many slugs in
 * ONE query. Added 2026-09-06 for app/page.tsx, which needs child data
 * for its featured + ticker picks and was calling
 * fetchTenderBySlugFromDb() once per pick — 13 separate round-trips at
 * the default counts (3 featured + 10 ticker), each joining three child
 * tables, on top of the full-table getAllTenders() the same render
 * already does. Returns a slug-keyed Map; null when Supabase isn't
 * configured, matching every other fetch*FromDb here.
 */
export async function fetchTendersBySlugsFromDb(slugs: string[]): Promise<Map<string, Tender> | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  if (slugs.length === 0) return new Map();

  const data = await retrySupabaseRead(
    () => supabase.from("tenders").select(TENDER_SELECT).in("slug", slugs),
    "Failed to fetch tenders by slug from Supabase",
  );

  return new Map((data as unknown as TenderRow[]).map((row) => [row.slug, toTender(row)]));
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
  status: TenderStatus;
  tender_documents: { id: string }[];
  submission_deadline: string | null;
};

const DOCUMENTS_NEEDED_SELECT = `
  slug, title, country, estimated_value, currency, relevance_tier, relevance_label, publication_date, source_url, status,
  tender_documents ( id ), submission_deadline
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
 *
 * `.not("status", "in", ...)` excludes already-awarded/cancelled tenders:
 * chasing down attachments for a tender that's already decided or dead is
 * wasted effort, so those are dropped from the worklist even if they'd
 * otherwise qualify (2026-09-05, explicit request).
 *
 * `.eq("documents_unavailable", false)` excludes tenders an admin has
 * explicitly dismissed via the "标记为无法获取" toggle — for sources with no
 * automated attachment path at all (Colombia's SECOP II detail page is
 * CAPTCHA-gated; see lib/ingestion/README.md), a tender would otherwise sit
 * in this worklist forever with no way to mark "not obtainable" distinct
 * from "not yet attempted" (2026-09-05, explicit request).
 *
 * Retired 2026-09-11: a second visibility rule used to hide any Colombia
 * tender with no submission deadline. It was the indirect way of keeping
 * already-decided Contratación Directa / régimen especial processes out,
 * and it was wrong in both directions — it hid genuine open tenders whose
 * deadline datos.gov.co had not synced yet (18 of 37 rows on 2026-09-08,
 * 14 of them flagship), while still admitting plenty of directa rows that
 * happened to carry a date. The gate moved to ingestion instead, where it
 * can say what was meant: only Licitación pública modalidades enter the
 * system at all (isIngestedColombiaModalidad, lib/ingestion/colombia-mapper.ts).
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
      .not("status", "in", "(awarded,cancelled)")
      .eq("documents_unavailable", false)
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
      status: row.status,
    }));
}

/** Used only for the rare legacy row with a stored tier but somehow no stored label — classifyRelevance() itself always sets both together, so this is a defensive fallback, not an expected path. */
const LABELS_FALLBACK: LocalizedText = { en: "Standard Project", es: "Proyecto Estándar", zh: "常规项目" };

/** The /admin/tenders list row shape — deliberately lighter than the full Tender (no nested requirements/key dates/risks joins) since this powers a table over 1000+ rows, not a detail view. */
export type AdminTenderListRow = {
  id: string;
  slug: string;
  tenderNumber: string;
  title: LocalizedText;
  buyer: string;
  industries: Tender["industries"];
  country: string;
  status: Tender["status"];
  relevanceTier: TenderRelevance["tier"] | null;
  relevanceManuallyOverridden?: boolean;
  homepageFeatured?: boolean;
  /**
   * Whether this tender has any logged analysis (qualification/experience/
   * document requirement or risk — see fetchAwardedSlugsWithAnalysis's own
   * comment). Only ever computed for `status === "awarded"` rows — cheap
   * because that's a small subset, unlike joining tender_requirements/
   * tender_risks for every row in this list, which powers a table over
   * 1000+ tenders (see this type's own header comment). `undefined` for
   * every non-awarded row: this field exists only to support the "已中标 +
   * 无标书分析" bulk-cleanup filter (2026-09-05, explicit request), which
   * only ever cares about awarded tenders.
   */
  hasAnalysis?: boolean;
  estimatedValue?: number;
  currency?: string;
  publicationDate: string;
  publicationDateIsEstimated?: boolean;
  updatedAt: string;
};

type AdminTenderListDbRow = {
  id: string;
  slug: string;
  tender_number: string;
  title: LocalizedText;
  buyer: string;
  industries: Tender["industries"];
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
  submission_deadline: string | null;
};

/**
 * Returns null when Supabase isn't configured. Every tender, regardless of
 * relevance tier — this is the admin's full inventory, not the public feed.
 *
 * Retired 2026-09-11: a second visibility rule used to hide any Colombia
 * tender with no submission deadline. It was the indirect way of keeping
 * already-decided Contratación Directa / régimen especial processes out,
 * and it was wrong in both directions — it hid genuine open tenders whose
 * deadline datos.gov.co had not synced yet (18 of 37 rows on 2026-09-08,
 * 14 of them flagship), while still admitting plenty of directa rows that
 * happened to carry a date. The gate moved to ingestion instead, where it
 * can say what was meant: only Licitación pública modalidades enter the
 * system at all (isIngestedColombiaModalidad, lib/ingestion/colombia-mapper.ts).
 * that cost real money (翻译标题, 标书分析) kept getting spent on them
 * before it's even known whether they're worth anything. Same
 * self-correcting behavior as the public rule: once a re-ingest/refresh
 * syncs a real deadline, the row reappears here automatically.
 */
export async function fetchAdminTenderListFromDb(): Promise<AdminTenderListRow[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: AdminTenderListDbRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "id, slug, tender_number, title, buyer, industries, country, status, relevance_tier, relevance_manually_overridden, homepage_featured, estimated_value, currency, publication_date, publication_date_is_estimated, updated_at, submission_deadline",
      )
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

  const awardedWithAnalysis = await fetchAwardedSlugsWithAnalysis(supabase);

  return rows
    .map((row) => ({
    id: row.id,
    slug: row.slug,
    tenderNumber: row.tender_number,
    title: row.title,
    buyer: row.buyer,
    industries: row.industries,
    country: row.country,
    status: row.status,
    relevanceTier: row.relevance_tier,
    relevanceManuallyOverridden: row.relevance_manually_overridden ?? false,
    homepageFeatured: row.homepage_featured ?? false,
    hasAnalysis: row.status === "awarded" ? awardedWithAnalysis.has(row.slug) : undefined,
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
    publicationDate: row.publication_date,
    publicationDateIsEstimated: row.publication_date_is_estimated ?? undefined,
    updatedAt: row.updated_at,
  }));
}
