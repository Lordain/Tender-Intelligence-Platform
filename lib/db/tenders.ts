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
  public_slug: string;
  tender_number: string;
  title: LocalizedText;
  /** Migration 0053. NULL until the generator reaches the row — see publicTitleOf(). */
  title_zh_public: string | null;
  /** Migration 0054. NULL until the generator reaches the row — see shortTitleOf(). */
  title_zh_short: string | null;
  summary: LocalizedText;
  /** Migration 0054. NULL until the generator reaches the row — see publicSummaryOf(), which fails closed rather than falling back. */
  summary_zh_public: string | null;
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
  ficha_url?: string | null;
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
  // Absent from TENDER_LIST_SELECT's narrower key-date join, which reads
  // type/date only.
  source_reference?: string | null;
};

type RiskRow = {
  id: string;
  level: TenderRisk["level"];
  title: LocalizedText;
  description: LocalizedText;
  source_reference: string | null;
};

/**
 * NOTE: every string here is sent verbatim as PostgREST's `?select=`
 * parameter. They are NOT SQL — there is no comment syntax, and a `--` line
 * inside one is parsed as part of a column name and fails the request (broke
 * production, 2026-09-11). Keep explanations out here.
 *
 * Flat columns only, no embedded child tables. The two selects below add
 * whichever children they actually need. Embedding a child HERE would put it
 * into TENDER_SELECT twice — once inherited, once its own — which PostgREST
 * rejects with "aggregate functions are not allowed in FROM clause of their
 * own query level" (the second failure of that same 2026-09-11 change).
 */
const TENDER_FLAT_FIELDS = `
  id, slug, public_slug, tender_number, title, title_zh_public, title_zh_short, summary, summary_zh_public, one_line_summary, buyer, country, government_level,
  industries, subcategory, scope_type, procedure_type, participation_scope,
  publication_date, publication_date_is_estimated,
  submission_deadline, award_date, awarded_to, awarded_value, estimated_value, currency, location,
  status, relevance_tier, relevance_label, relevance_reason, relevance_manually_overridden,
  homepage_featured, documents_unavailable, source_name, source_url, ficha_url, created_at, updated_at
`;

/** One tender's full detail, including its qualifications/keyDates/risks — for fetchTenderBySlugFromDb (a single row). */
const TENDER_SELECT = `
  ${TENDER_FLAT_FIELDS},
  tender_requirements ( id, kind, title, description, mandatory, source_reference, sort_order ),
  tender_key_dates ( id, type, date, mandatory, notes, source_reference ),
  tender_risks ( id, level, title, description, source_reference )
`;

/**
 * The flat fields plus the two key-date columns deriveTenderStatus() needs
 * for its clarification-day rule (lib/tender-status.ts) — and nothing else.
 *
 * This query is unbounded (thousands of rows, paged), and every real caller
 * renders flat fields only, never qualifications/risks — confirmed 2026-09-03
 * by grepping every consumer — so joining the other two child tables here
 * would transfer a lot of rows nobody reads. toTender() defaults whatever is
 * omitted to empty arrays.
 */
const TENDER_LIST_SELECT = `
  ${TENDER_FLAT_FIELDS},
  tender_key_dates ( type, date )
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
    sourceReference: row.source_reference ?? undefined,
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
    procedureType: row.procedure_type,
    tenderNumber: row.tender_number,
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
    publicSlug: row.public_slug,
    tenderNumber: row.tender_number,
    title: row.title,
    titleZhPublic: row.title_zh_public ?? undefined,
    titleZhShort: row.title_zh_short ?? undefined,
    summary: row.summary,
    summaryZhPublic: row.summary_zh_public ?? undefined,
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
      publicationDate: row.publication_date,
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
    fichaUrl: row.ficha_url ?? undefined,
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

/**
 * Ids of every tender that has analysis logged against it — at least one
 * qualification/experience/document requirement, or one risk. The same
 * "标书分析结果" data the Layer 2 extraction writes and the admin CRUD
 * editors edit, and the same thing the detail page renders under 标书分析.
 *
 * Read from the CHILD tables rather than by joining them onto `tenders`,
 * which is what the awarded-only version of this did. The join is what forced
 * that one to be awarded-only: fetchAllTendersFromDb's own comment records
 * joining these children onto every row of an unbounded full-table query as a
 * real cost that had to be undone once the table held thousands of rows.
 * These two tables only have rows for tenders that HAVE been analysed, so
 * reading them directly stays proportional to the analysed set — a few
 * hundred — no matter how large `tenders` grows.
 *
 * Ids, not slugs, because that is the column the child tables carry.
 */
async function fetchTenderIdsWithAnalysis(supabase: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const table of ["tender_requirements", "tender_risks"] as const) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const data = await retrySupabaseRead(
        () => supabase
          .from(table)
          .select("tender_id")
          // Explicit order: .range() paging over an unspecified row order
          // drops and repeats rows between pages, and a dropped page here
          // would hide real tenders from the public feed.
          .order("tender_id", { ascending: true })
          .range(from, from + SUPABASE_PAGE_SIZE - 1),
        `Failed to read ${table} while checking which tenders have analysis`,
      );

      const page = data as unknown as { tender_id: string | null }[];
      for (const row of page) {
        if (row.tender_id) ids.add(row.tender_id);
      }
      if (page.length < SUPABASE_PAGE_SIZE) break;
    }
  }
  return ids;
}

/** One tender with just enough of its analysis children joined to answer "is there any?". */
type AnalysisProbeRow = {
  slug: string;
  tender_requirements: { id: string }[];
  tender_risks: { id: string }[];
};

/**
 * Of the slugs given, the ones with analysis logged — at least one
 * requirement or risk — the same test fetchTenderIdsWithAnalysis applies to
 * the whole table, asked of a known set of slugs instead.
 *
 * Takes an explicit slug list rather than scanning the table because the only
 * caller (app/sitemap.ts) needs it for CLOSED tenders, and closed is derived
 * from the calendar rather than stored — it cannot be expressed as a filter
 * here. Passing the slugs the caller already computed keeps this bounded by
 * the closed population instead of joining the whole table, which is the cost
 * fetchAllTendersFromDb's own comment exists to avoid.
 */
export async function fetchSlugsWithAnalysis(slugs: readonly string[]): Promise<Set<string>> {
  const withAnalysis = new Set<string>();
  const supabase = getSupabaseServerClient();
  if (!supabase || slugs.length === 0) return withAnalysis;

  // Postgres has a ceiling on the length of an IN list, and Supabase sends it
  // in the URL, so this is chunked rather than sent as one filter.
  const CHUNK = 200;
  for (let start = 0; start < slugs.length; start += CHUNK) {
    const chunk = slugs.slice(start, start + CHUNK);
    const data = await retrySupabaseRead(
      () => supabase
        .from("tenders")
        .select("slug, tender_requirements ( id ), tender_risks ( id )")
        .in("slug", chunk as string[]),
      "Failed to check which tenders have analysis logged",
    );
    for (const row of data as unknown as AnalysisProbeRow[]) {
      if (row.tender_requirements.length > 0 || row.tender_risks.length > 0) withAnalysis.add(row.slug);
    }
  }
  return withAnalysis;
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
 * VISIBILITY RULE: a tender is public only once it has analysis logged —
 * at least one requirement or one risk. Nothing else changes what appears on
 * the site, so this one line is worth reading carefully.
 *
 * Widened 2026-09-18 on the user's request (标书分析还没处理完的项目，前台不显示)
 * from the 2026-09-05 rule it replaces, which said the same thing about
 * "awarded" tenders only. The old rule is not lost, it is subsumed: every
 * tender the old one hid, this one hides too.
 *
 * "Analysis logged" is deliberately the SAME test the reader can apply
 * themselves — it is exactly the 标书分析 section on the detail page. A tender
 * whose documents were processed and yielded nothing counts as not analysed,
 * because "extraction finished and found nothing" and "extraction has not
 * run" produce the identical empty page, and the complaint this rule answers
 * is about that page. (/admin/documents-needed's own view distinguishes the
 * two, which is where that distinction is useful.)
 *
 * This is the one function behind every public-facing surface — the main
 * /tenders feed (via lib/tenders.ts), the homepage teaser (app/page.tsx also
 * calls getAllTenders()), the 项目总数 shown on the site (siteTenderCount
 * derives from this list) and the notification digest — so gating it here
 * covers all of them at once.
 *
 * What it deliberately does NOT cover, because neither is a feed:
 *   - a tender's own detail page (fetchTenderBySlugFromDb) and a saved
 *     tender (fetchTendersBySlugsFromDb), so an existing link or bookmark
 *     keeps working rather than 404ing;
 *   - the admin list (fetchAdminTenderListFromDb), which has to show every
 *     unanalysed row — that is the queue of work this rule creates.
 *
 * It follows that the size of the public feed is now bounded by how much
 * analysis has been run. `npm run audit:public-visibility` reports that
 * number before and after; run it before deploying this.
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

  const withAnalysis = await fetchTenderIdsWithAnalysis(supabase);
  return rows.filter((row) => withAnalysis.has(row.id)).map(toTender);
});

export type TenderSitemapEntry = {
  publicSlug: string;
  updatedAt: string;
};

/**
 * Minimal, unfiltered inventory for sitemap generation. Unlike the public
 * list query, this intentionally includes closed rows without document
 * analysis: every tender now has a useful public summary landing page, so
 * hiding those slugs from discovery would contradict the detail-page policy.
 */
export async function fetchTenderSitemapEntriesFromDb(): Promise<TenderSitemapEntry[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const entries: TenderSitemapEntry[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const data = await retrySupabaseRead(
      () => supabase
        .from("tenders")
        .select("public_slug, updated_at")
        .order("updated_at", { ascending: false })
        .range(from, from + SUPABASE_PAGE_SIZE - 1),
      "Failed to fetch tender sitemap entries from Supabase",
    );

    const page = data as unknown as Array<{ public_slug: string; updated_at: string }>;
    entries.push(...page.map((row) => ({ publicSlug: row.public_slug, updatedAt: row.updated_at })));
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return entries;
}

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
 * Public detail lookup. Deliberately does not accept the internal slug: an old
 * URL containing a government project code must become a 404 rather than a
 * redirect that confirms the code-to-page mapping.
 */
export async function fetchTenderByPublicSlugFromDb(
  publicSlug: string,
): Promise<Tender | null | undefined> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const data = await retrySupabaseRead(
    () => supabase
      .from("tenders")
      .select(TENDER_SELECT)
      .eq("public_slug", publicSlug)
      .maybeSingle(),
    "Failed to fetch tender by public slug from Supabase",
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
  tender_number: string;
  title: LocalizedText;
  country: string;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevance["tier"] | null;
  relevance_label: LocalizedText | null;
  publication_date: string;
  source_url: string;
  source_name: string;
  status: TenderStatus;
  tender_documents: { id: string; extraction_status: string | null }[];
  tender_key_dates?: { type: TenderKeyDate["type"]; date: string }[];
  tender_document_links: { id: string }[];
  submission_deadline: string | null;
  documents_downloaded_at: string | null;
};

// tender_key_dates is joined for one reason: deriveTenderStatus needs it (a
// PEMEX validity_end is the only end date some rows have). Same narrow
// type/date join TENDER_LIST_SELECT uses over the whole table.
const DOCUMENTS_NEEDED_SELECT = `
  slug, tender_number, title, country, estimated_value, currency, relevance_tier, relevance_label, publication_date, source_url, source_name, status,
  tender_documents ( id, extraction_status ), tender_document_links ( id ), submission_deadline, documents_downloaded_at,
  tender_key_dates ( type, date )
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

  // "Has a document" used to mean "has any tender_documents row", which is
  // how five Chilean tenders fell off this list on 2026-09-25 while 项目管理
  // still counted them as 还没跑过分析: backfill-chile-ficha --download had
  // recorded their .docx/.xlsx forms — the only attachments Mercado Público
  // serves without a reCAPTCHA — and the Bases PDFs behind 「Ver anexos」 were
  // never there. A tender now leaves this list when a document of it has been
  // ANALYSED, the same test the admin list's analysis filter applies
  // (fetchAnalysisStates), so the two can no longer disagree about the same row.
  return rows
    .filter((row) => !row.tender_documents.some((document) => document.extraction_status === "extracted"))
    .map((row) => ({
      slug: row.slug,
      tenderNumber: row.tender_number,
      title: row.title,
      country: row.country,
      estimatedValue: row.estimated_value ?? undefined,
      currency: row.currency ?? undefined,
      relevanceTier: row.relevance_tier ?? "standard",
      relevanceLabel: row.relevance_label ?? LABELS_FALLBACK,
      publicationDate: row.publication_date,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      // Derived, exactly as the public list does it (toTender above). Showing
      // the stored column here is how a tender whose junta de aclaraciones
      // was a week ago still read 澄清中 on this page while the site said
      // 招标中 — the stored status is only ever correct on the day it was
      // written (lib/tender-status.ts's own header says so).
      status: deriveTenderStatus(row.status, {
        submissionDeadline: row.submission_deadline,
        publicationDate: row.publication_date,
        keyDates: row.tender_key_dates ?? [],
      }),
      documentLinkCount: row.tender_document_links?.length ?? 0,
      documentsDownloadedAt: row.documents_downloaded_at ?? undefined,
      ...(row.tender_documents.length > 0
        ? {
            filesOnRecord: {
              pdfPending: row.tender_documents.filter((document) => document.extraction_status === "pending").length,
              otherFiles: row.tender_documents.filter((document) => document.extraction_status !== "pending").length,
            },
          }
        : {}),
    }));
}

/**
 * The two summary strings worth searching, once each, lowercased.
 *
 * `zh` is skipped when it is byte-for-byte the `es` — that is the
 * untranslated() mirror every mapper writes (lib/ingestion/text-utils.ts),
 * not a translation, and shipping it twice doubles this field on exactly the
 * rows that gain nothing from it.
 */
function flattenSummaryForSearch(summary: LocalizedText | null): string {
  if (!summary) return "";
  const es = summary.es ?? "";
  const zh = summary.zh ?? "";
  return (zh && zh !== es ? `${zh} ${es}` : es).toLowerCase();
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
   * What running 标书分析 on this tender's documents produced, or that nobody
   * has run it.
   *
   *   "empty"     — a document WAS analysed and yielded nothing: no
   *                 qualification, no experience requirement, no required
   *                 document, no risk. The 0/0/0/0 row in a batch run, and a
   *                 worklist: either the wrong file was fetched, or it is a
   *                 scan the text path could not read (2026-09-16 — a 61-page
   *                 DOCUMENTO BASE returned 0/0/0/0 for exactly that reason).
   *   "analysed"  — a document was analysed and produced something.
   *   "none"      — no document of this tender has been analysed.
   *
   * It replaces the awarded-only hasAnalysis filter (2026-09-16, explicit
   * request). That one could only ever answer for `status === "awarded"`
   * rows, because joining requirements and risks for every row of a 1000-row
   * table was not worth one cleanup filter. This asks the question of the
   * document instead, so one probe scoped with tender_documents!inner covers
   * every tender at the same cost: whatever has not been analysed is simply
   * absent from it.
   *
   * The 已中标 + 没跑过分析 cleanup the old filter existed for is still one
   * click away — 项目状态 已中标 plus 标书分析 还没跑过.
   */
  analysisState?: "empty" | "analysed" | "none";
  estimatedValue?: number;
  currency?: string;
  publicationDate: string;
  publicationDateIsEstimated?: boolean;
  /** Undefined when the source has not published one — not every tender has a deadline. */
  submissionDeadline?: string;
  updatedAt: string;
  /**
   * The summary, flattened and lowercased, for the search box only — never
   * rendered.
   *
   * The admin search matched title/buyer/slug/tenderNumber while the public
   * list (lib/filter-tenders.ts) also matched the summary, so a word that
   * appears only in the description found the tender on the public site and
   * nothing in 项目管理 (2026-09-18, the user's request to align the two).
   *
   * A flattened string rather than the LocalizedText: this table is over
   * 1000 rows and every byte is shipped to the browser, so it carries the zh
   * and the es once each and drops `en`, which every mapper mirrors from
   * `es` and no writer ever fills. Lowercased here rather than per keystroke
   * per row, since it exists for exactly one comparison.
   */
  searchSummary: string;
};

type AdminTenderListDbRow = {
  id: string;
  slug: string;
  tender_number: string;
  title: LocalizedText;
  summary: LocalizedText | null;
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
  tender_key_dates?: { type: TenderKeyDate["type"]; date: string }[];
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
type AnalysedDocumentProbeRow = {
  slug: string;
  tender_requirements: { id: string }[];
  tender_risks: { id: string }[];
};

/**
 * Split every tender whose bid document has been analysed into the ones that
 * produced something and the ones that came back 0/0/0/0 — see
 * AdminTenderListRow.analysisState.
 *
 * `tender_documents!inner` with extraction_status = "extracted" is what keeps
 * this cheap: only tenders someone actually paid to analyse are joined, not
 * the whole table. A tender nobody has analysed appears in neither set, which
 * is exactly the third state.
 */
async function fetchAnalysisStates(supabase: SupabaseClient): Promise<{ empty: Set<string>; analysed: Set<string> }> {
  const empty = new Set<string>();
  const analysed = new Set<string>();
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const data = await retrySupabaseRead(
      () => supabase
        .from("tenders")
        .select("slug, tender_documents!inner ( id ), tender_requirements ( id ), tender_risks ( id )")
        .eq("tender_documents.extraction_status", "extracted")
        .range(from, from + SUPABASE_PAGE_SIZE - 1),
      "Failed to check which analysed tenders came back empty",
    );

    const page = data as unknown as AnalysedDocumentProbeRow[];
    for (const row of page) {
      const hasContent = row.tender_requirements.length > 0 || row.tender_risks.length > 0;
      (hasContent ? analysed : empty).add(row.slug);
    }
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }
  return { empty, analysed };
}

export async function fetchAdminTenderListFromDb(): Promise<AdminTenderListRow[] | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rows: AdminTenderListDbRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        // tender_key_dates joined for deriveTenderStatus only — see
        // DOCUMENTS_NEEDED_SELECT's comment for why it cannot be skipped.
        "id, slug, tender_number, title, summary, buyer, industries, country, status, relevance_tier, relevance_manually_overridden, homepage_featured, estimated_value, currency, publication_date, publication_date_is_estimated, updated_at, submission_deadline, tender_key_dates ( type, date )",
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

  const analysisStates = await fetchAnalysisStates(supabase);

  return rows
    .map((row) => ({
    id: row.id,
    slug: row.slug,
    tenderNumber: row.tender_number,
    title: row.title,
    buyer: row.buyer,
    industries: row.industries,
    country: row.country,
    // Derived, like every other surface — see toTender and
    // fetchTendersNeedingDocumentsFromDb.
    status: deriveTenderStatus(row.status, {
      submissionDeadline: row.submission_deadline,
      publicationDate: row.publication_date,
      keyDates: row.tender_key_dates ?? [],
    }),
    relevanceTier: row.relevance_tier,
    relevanceManuallyOverridden: row.relevance_manually_overridden ?? false,
    homepageFeatured: row.homepage_featured ?? false,
    analysisState: analysisStates.empty.has(row.slug)
      ? "empty"
      : analysisStates.analysed.has(row.slug)
        ? "analysed"
        : "none",
    estimatedValue: row.estimated_value ?? undefined,
    currency: row.currency ?? undefined,
    publicationDate: row.publication_date,
    publicationDateIsEstimated: row.publication_date_is_estimated ?? undefined,
    submissionDeadline: row.submission_deadline ?? undefined,
    updatedAt: row.updated_at,
    searchSummary: flattenSummaryForSearch(row.summary),
  }));
}
