import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAntaqHearings,
  hearingDocumentLinks,
  type AntaqHarvest,
} from "@/lib/ingestion/connectors/antaq-live";
import { mapAntaqHearingToTender } from "@/lib/ingestion/antaq-mapper";
import { judgeAntaqWindow } from "@/lib/ingestion/antaq-window";
import { saveDocumentLinks } from "@/lib/ingestion/document-links";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { ANTAQ_SOURCE_NAME } from "@/lib/relevance";
import type { Tender } from "@/types/tender";

/**
 * ANTAQ's port-concession hearings, as one function the CLI and the admin
 * button both call.
 *
 * Split out of scripts/ingest-antaq.ts on 2026-09-20 for the reason
 * ingest-brazil.ts states in its own header: one code path, so the page and
 * `npm run ingest:antaq` cannot drift into disagreeing about the same source.
 * The script now prints this result; the route returns it as JSON.
 *
 * ── What a run actually obtains, and what it structurally cannot ──────────
 *
 * Measured on all five captured pages, and the single most important thing
 * for anyone reading the result panel:
 *
 *   ✓ what the project IS (lblSubTitulo — one line, in Portuguese), the
 *     objective paragraph, the full cronograma, the hearing number, the port
 *     area code, the source URL, the publication date, and the last day for
 *     contributions.
 *   ✓ the `Comunicados` attachments as real downloadable PDFs — 5 to 9 per
 *     hearing, 21 of 21 measured fetchable.
 *
 *   ✗ ANY money. Not a ceiling, not a reference price, not a CAPEX figure. A
 *     hearing page states none; the investment number lives inside the EVTEA
 *     PDF behind a separate link. antaq-mapper.ts refuses to invent one.
 *   ✗ a bid deadline, because bidding has not opened. The auction that will
 *     open it has no published date. So status is `planned`, the contributions
 *     deadline goes to keyDates as a `questions_deadline`, and
 *     submissionDeadline stays empty — which is also what keeps the 12-day
 *     bidding-window rule from firing on rows that have no bidding window.
 *
 *   ⚠ the draft edital, the draft contract and the EVTEA are NOT captured as
 *     document links even though their URLs are. Those `Documentação` buttons
 *     are landing PAGES, not files; writing them into tender_document_links
 *     would put an HTML page behind a subscriber's download button. They are
 *     returned in `documentSections` so a person can follow them, and
 *     harvesting what sits behind them needs one more fetch layer written
 *     against a real capture of such a page, which does not exist yet.
 *
 * Read the connector's header for which hosts are fetched and which are
 * deliberately not: 6 of ANTAQ's 20 listed hearings are readable, and the
 * other 14 are behind Cloudflare (measured 2026-09-20 from two machines).
 */

export type AntaqIngestOptions = {
  write: boolean;
  /** Calendar years inclusive of the current one; 2 keeps 2025 and 2026. 0 means no window. */
  years?: number;
  /** Stop after this many hearing pages. For trying the network, not for production. */
  limit?: number;
  /** Save the Comunicados PDFs as document links. Only meaningful on a write run. */
  documents?: boolean;
};

/** One hearing, as both the CLI report and the admin panel need to show it. */
export type AntaqIngestRow = {
  tenderNumber: string;
  slug: string;
  title: string;
  tier: string;
  sourceUrl: string;
  publicationDate: string;
  /** The last day the hearing states about ITSELF — the real age signal. */
  lastStatedDay?: string;
  contributionsDeadline?: string;
  inWindow: boolean;
  /** Why it is in or out of the window, in one line. */
  why: string;
  /** Set when Plone's byline disagrees with the hearing's own dates. */
  pageStampWarning?: string;
  /** How many Comunicados PDFs the page carries. */
  noticeCount: number;
  /** The Documentação landing pages — printed and linked, never stored as documents. */
  documentSections: { title: string; url: string }[];
};

export type AntaqIngestResult = {
  /** Everything the "em andamento" page listed, before triage. */
  listedCount: number;
  readCount: number;
  /** Why the rest were never fetched, one line per host. */
  skippedByHost: { host: string; count: number; why: string }[];
  /** Fetched and still unreadable — a page-structure change, not a closed door. */
  failed: { title: string; why: string }[];
  /** Read but not mappable: no publication date, or only a reference number for a title. */
  unmappable: string[];
  /** Every mapped hearing, in and out of the window, so a dropped one can be seen. */
  rows: AntaqIngestRow[];
  keptCount: number;
  droppedByWindow: number;
  /** The earliest hearing year kept, or undefined when no window was applied. */
  cutoffYear?: number;
  write: boolean;
  written?: number;
  writeFailed?: number;
  skippedExcluded?: number;
  skippedClosed?: number;
  documentLinks?: { tendersWithLinks: number; linkCount: number; unmatchedSlugs: number; failed: number };
};

export { ANTAQ_SOURCE_NAME };

export async function ingestAntaq(
  supabase: SupabaseClient | null,
  options: AntaqIngestOptions,
  onProgress?: (message: string) => void,
): Promise<AntaqIngestResult> {
  const years = options.years ?? 2;
  const now = new Date();

  const harvest: AntaqHarvest = await fetchAntaqHearings({ limit: options.limit, onProgress });

  const byHost = new Map<string, { count: number; why: string }>();
  for (const skip of harvest.skipped) {
    const seen = byHost.get(skip.host);
    if (seen) seen.count += 1;
    else byHost.set(skip.host, { count: 1, why: skip.why });
  }

  const rows: AntaqIngestRow[] = [];
  const unmappable: string[] = [];
  const keptTenders: Tender[] = [];
  const keptHearings: { slug: string; hearing: (typeof harvest.hearings)[number] }[] = [];

  for (const hearing of harvest.hearings) {
    const tender = mapAntaqHearingToTender(hearing, now);
    if (tender === null) {
      unmappable.push(
        `${hearing.number}${hearing.projectCode ? ` ${hearing.projectCode}` : ""} —— 没有发布日期，或者只有一个编号当标题`,
      );
      continue;
    }
    const verdict = judgeAntaqWindow(hearing, years, now);
    rows.push({
      tenderNumber: tender.tenderNumber,
      slug: tender.slug,
      title: tender.title.es ?? tender.tenderNumber,
      tier: tender.relevance.tier,
      sourceUrl: tender.sourceUrl,
      publicationDate: tender.publicationDate,
      lastStatedDay: verdict.lastStatedDay,
      contributionsDeadline: hearing.contributionsDeadline,
      inWindow: verdict.inWindow,
      why: verdict.why,
      pageStampWarning: verdict.pageStampWarning,
      noticeCount: hearing.notices.length,
      documentSections: hearing.documentSections,
    });
    if (verdict.inWindow) {
      keptTenders.push(tender);
      keptHearings.push({ slug: tender.slug, hearing });
    }
  }

  const result: AntaqIngestResult = {
    listedCount: harvest.listed.length,
    readCount: harvest.hearings.length,
    skippedByHost: [...byHost]
      .map(([host, { count, why }]) => ({ host, count, why }))
      .sort((a, b) => b.count - a.count),
    failed: harvest.failed.map((f) => ({ title: f.title, why: f.why })),
    unmappable,
    rows,
    keptCount: keptTenders.length,
    droppedByWindow: rows.length - keptTenders.length,
    cutoffYear: years > 0 ? now.getUTCFullYear() - (years - 1) : undefined,
    write: options.write,
  };

  if (!options.write || supabase === null) return result;

  const { upsertedCount, skippedExcludedCount, skippedClosedCount, failed } = await upsertTendersBatched(
    supabase,
    keptTenders,
  );
  result.written = upsertedCount;
  result.writeFailed = failed?.length ?? 0;
  result.skippedExcluded = skippedExcludedCount;
  result.skippedClosed = skippedClosedCount;

  if (options.documents !== true) return result;

  // Only the Comunicados PDFs. The Documentação sections are pages — see this
  // file's header, and hearingDocumentLinks() for the test that asserts none
  // of them reaches the links table.
  const saved = await saveDocumentLinks(
    supabase,
    keptHearings.map(({ slug, hearing }) => ({ slug, links: hearingDocumentLinks(hearing) })),
  );
  result.documentLinks = {
    tendersWithLinks: saved.tendersWithLinks,
    linkCount: saved.linkCount,
    unmatchedSlugs: saved.unmatchedSlugs,
    failed: saved.failed.length,
  };
  return result;
}
