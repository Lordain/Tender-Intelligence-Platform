/**
 * Argentina ingestion, for the daily cron and the admin tab's manual button.
 * Four sources, chosen with the user on 2026-09-27 (COMPR.AR + CONTRAT.AR +
 * ADIF + 政府公报四个一起接):
 *
 *   COMPR.AR     national goods and services       connectors/argentina-portal-live.ts
 *   CONTRAT.AR   public works, concessions,         (same connector)
 *                privatizations
 *   ADIF         national rail infrastructure       connectors/adif-live.ts
 *   Boletín      state companies and provinces      connectors/boletin-oficial-live.ts
 *   Oficial      that buy outside the two portals
 *   Mendoza      the Province of Mendoza's own      connectors/argentina-portal-live.ts
 *                COMPR.AR (added 2026-10-04)        (same connector)
 *
 * Only rows the platform's rules keep are written — the same rules as every
 * other country, with Argentina's two settings in lib/relevance.ts. Staged
 * (admin pages only) until 2026-09-29; public since.
 *
 * A source that fails does not stop the others; its error is reported with
 * the result, and the run as a whole fails only if every source did.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import {
  fetchArgentinaPortal,
  isOpenCallProcedure,
  type ArgentinaPortalFetchResult,
  type ArgentinaPortalListRow,
} from "@/lib/ingestion/connectors/argentina-portal-live";
import { fetchAdifActiveTenders, type AdifTender } from "@/lib/ingestion/connectors/adif-live";
import { fetchBoletinEditions, fetchBoletinNotice, type BoletinListing, type BoletinNotice } from "@/lib/ingestion/connectors/boletin-oficial-live";
import {
  adifDocumentLinks,
  ARGENTINA_COUNTRY,
  boletinSkipReason,
  COMPRAR_SOURCE_NAME,
  MENDOZA_SOURCE_NAME,
  mapAdifTenderToTender,
  mapBoletinNoticeToTender,
  mapPortalRecordToTender,
  portalDocumentLinks,
} from "@/lib/ingestion/argentina-mapper";
import { classifyStoredTender } from "@/lib/relevance";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { saveDocumentLinks, type DocumentLinksForSlug } from "@/lib/ingestion/document-links";
import { runPool } from "@/lib/ingestion/run-pool";
import { COMPANY_SOURCE_WINDOW_DAYS } from "@/lib/ingestion/publication-window";
import { filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import type { ArgentinaSourceId } from "@/lib/ingestion/argentina-import-result";

export const ARGENTINA_SOURCES: ArgentinaSourceId[] = ["comprar", "contratar", "adif", "boletin", "mendoza"];

export const ARGENTINA_SOURCE_LABELS: Record<ArgentinaSourceId, string> = {
  comprar: "COMPR.AR（全国货物与服务）",
  contratar: "CONTRAT.AR（全国工程、特许经营、私有化）",
  adif: "ADIF（国家铁路基础设施公司）",
  boletin: "政府公报第三部分（国企、省级项目）",
  mendoza: "COMPR.AR Mendoza（门多萨省政府采购）",
};

export type ArgentinaSourceReport = {
  id: ArgentinaSourceId;
  /** Rows the source listed. */
  listed: number;
  /** Rows whose detail was read and mapped. */
  mapped: number;
  kept: number;
  /** Rows read but not imported, with why — COMPR.AR's small procedures, Boletín amendments, closed calls, calls published before the window. */
  skipped: number;
  failures: { ref: string; error: string }[];
  /** The whole source failed. */
  error?: string;
  seconds: number;
};

export type ArgentinaIngestResult = {
  sources: ArgentinaSourceReport[];
  rows: { tender: Tender; source: ArgentinaSourceId }[];
  kept: Tender[];
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
  documentLinks?: number;
};

export type ArgentinaFetchers = {
  portal: typeof fetchArgentinaPortal;
  adif: () => Promise<AdifTender[]>;
  boletinEditions: (options: { editions: number; now?: Date }) => Promise<BoletinListing[]>;
  boletinNotice: (listing: BoletinListing) => Promise<BoletinNotice>;
};

const LIVE_FETCHERS: ArgentinaFetchers = {
  portal: fetchArgentinaPortal,
  adif: fetchAdifActiveTenders,
  boletinEditions: fetchBoletinEditions,
  boletinNotice: fetchBoletinNotice,
};

/**
 * Which COMPR.AR rows are worth opening. An open call always is; a smaller
 * procedure only when its name alone already passes the rules — a Licitación
 * Privada is capped by law far under the floor and has no amount on the page,
 * so what can keep it is a target sector in its name, and that is visible
 * from the list without opening it.
 */
export function comprarRowWanted(row: ArgentinaPortalListRow, portal: "comprar" | "mendoza" = "comprar"): boolean {
  if (isOpenCallProcedure(row.procedureType)) return true;
  if (/directa|subasta/i.test(row.procedureType)) return false;
  const { relevance } = classifyStoredTender({
    title: row.name,
    summary: row.name,
    buyer: row.saf ?? row.unit,
    country: ARGENTINA_COUNTRY,
    governmentLevel: portal === "mendoza" ? "state" : "federal",
    scopeType: "unknown",
    procedureType: row.procedureType,
    tenderNumber: row.processNumber,
    sourceName: portal === "mendoza" ? MENDOZA_SOURCE_NAME : COMPRAR_SOURCE_NAME,
  });
  return relevance.tier !== "excluded";
}

function isStillOpen(tender: Tender, now: Date): boolean {
  return !tender.submissionDeadline || Date.parse(tender.submissionDeadline) >= now.getTime();
}

async function timed<T>(work: () => Promise<T>): Promise<{ value?: T; error?: string; seconds: number }> {
  const started = Date.now();
  try {
    return { value: await work(), seconds: (Date.now() - started) / 1000 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), seconds: (Date.now() - started) / 1000 };
  }
}

export async function ingestArgentina(
  supabase: SupabaseClient | null,
  options: {
    write: boolean;
    sources?: ArgentinaSourceId[];
    boletinEditions?: number;
    now?: Date;
    fetchers?: Partial<ArgentinaFetchers>;
    /**
     * Waits before retrying a portal that cannot be reached at all. The daily
     * job keeps the connector's default (2 and 5 minutes); the admin button,
     * limited to five minutes, passes [] and reports the cause at once.
     */
    portalReachRetryPausesMs?: readonly number[];
    /**
     * COMPR.AR and CONTRAT.AR list every call still open, however old — a
     * Vialidad Nacional road call published 2026-05-18 still took bids at the
     * end of September — so each run offered months of backlog (the user,
     * 2026-09-29: 为什么自动跑的过程中，会进一些很老的项目？). Only calls
     * published within this many days are imported, the same 3-day window as
     * the company sources (publication-window.ts); 0 reads them all.
     *
     * Not applied to ADIF, whose list has no publication date (a first-seen
     * row is stamped today, estimated), nor to the Boletín Oficial, already
     * bounded by the editions it reads: its date is the edition's, and a
     * Friday edition read on Monday would fall outside three days.
     */
    days?: number;
  },
): Promise<ArgentinaIngestResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? COMPANY_SOURCE_WINDOW_DAYS;
  const fetchers = { ...LIVE_FETCHERS, ...options.fetchers };
  const selected = new Set(options.sources ?? ARGENTINA_SOURCES);
  const rows: ArgentinaIngestResult["rows"] = [];
  const documentLinks: DocumentLinksForSlug[] = [];

  const portalSource = async (id: "comprar" | "contratar" | "mendoza"): Promise<ArgentinaSourceReport> => {
    const run = await timed<ArgentinaPortalFetchResult>(() =>
      fetchers.portal(id, {
        wanted: id === "contratar" ? () => true : (row) => comprarRowWanted(row, id),
        ...(options.portalReachRetryPausesMs ? { reachRetryPausesMs: options.portalReachRetryPausesMs } : {}),
      }),
    );
    if (!run.value) return { id, listed: 0, mapped: 0, kept: 0, skipped: 0, failures: [], error: run.error, seconds: run.seconds };
    let kept = 0;
    let skipped = run.value.listed.length - run.value.records.length;
    for (const record of run.value.records) {
      const tender = mapPortalRecordToTender(record, now);
      if (!isStillOpen(tender, now) || filterTendersPublishedWithinDays([tender], days, now).length === 0) {
        skipped += 1;
        continue;
      }
      rows.push({ tender, source: id });
      documentLinks.push({ slug: tender.slug, links: portalDocumentLinks(record) });
      if (tender.relevance.tier !== "excluded") kept += 1;
    }
    return {
      id,
      listed: run.value.listed.length,
      mapped: run.value.records.length,
      kept,
      skipped,
      failures: [
        ...(run.value.stoppedEarly ? [{ ref: "列表", error: run.value.stoppedEarly }] : []),
        ...run.value.failed.map((failure) => ({ ref: failure.processNumber, error: failure.error })),
      ],
      seconds: run.seconds,
    };
  };

  const adifSource = async (): Promise<ArgentinaSourceReport> => {
    const run = await timed(() => fetchers.adif());
    if (!run.value) return { id: "adif", listed: 0, mapped: 0, kept: 0, skipped: 0, failures: [], error: run.error, seconds: run.seconds };
    let kept = 0;
    let skipped = 0;
    for (const adif of run.value) {
      const tender = mapAdifTenderToTender(adif, now);
      if (!isStillOpen(tender, now)) {
        skipped += 1;
        continue;
      }
      rows.push({ tender, source: "adif" });
      documentLinks.push({ slug: tender.slug, links: adifDocumentLinks(adif) });
      if (tender.relevance.tier !== "excluded") kept += 1;
    }
    return { id: "adif", listed: run.value.length, mapped: run.value.length, kept, skipped, failures: [], seconds: run.seconds };
  };

  const boletinSource = async (): Promise<ArgentinaSourceReport> => {
    const failures: ArgentinaSourceReport["failures"] = [];
    let skipped = 0;
    let mapped = 0;
    let kept = 0;
    const run = await timed(async () => {
      const listings = await fetchers.boletinEditions({ editions: options.boletinEditions ?? 2, now });
      // Read only what can be a call: awards, evaluations and sales are
      // skipped from the category heading, ADIF's notices from the organism.
      const candidates = listings.filter(
        (listing) =>
          !/^(ADJUDICACIONES|PREADJUDICACIONES|DICTAMEN|VENTAS Y OFRECIMIENTOS|LOCACIONES)/i.test(listing.category) &&
          !/INFRAESTRUCTURAS FERROVIARIAS/i.test(listing.organism),
      );
      skipped += listings.length - candidates.length;
      const bySlug = new Map<string, Tender>();
      await runPool(candidates, 4, async (listing) => {
        try {
          const notice = await fetchers.boletinNotice(listing);
          if (boletinSkipReason(notice)) {
            skipped += 1;
            return;
          }
          const tender = mapBoletinNoticeToTender(notice, now);
          mapped += 1;
          if (!isStillOpen(tender, now)) {
            skipped += 1;
            return;
          }
          // The same call runs in consecutive editions; the newest reading wins.
          const earlier = bySlug.get(tender.slug);
          if (!earlier || Date.parse(tender.publicationDate) >= Date.parse(earlier.publicationDate)) bySlug.set(tender.slug, tender);
        } catch (err) {
          failures.push({ ref: listing.url, error: err instanceof Error ? err.message : String(err) });
        }
      });
      for (const tender of bySlug.values()) {
        rows.push({ tender, source: "boletin" });
        if (tender.relevance.tier !== "excluded") kept += 1;
      }
      return listings.length;
    });
    return { id: "boletin", listed: run.value ?? 0, mapped, kept, skipped, failures, ...(run.error ? { error: run.error } : {}), seconds: run.seconds };
  };

  const jobs: Promise<ArgentinaSourceReport>[] = [];
  if (selected.has("comprar")) jobs.push(portalSource("comprar"));
  if (selected.has("contratar")) jobs.push(portalSource("contratar"));
  if (selected.has("adif")) jobs.push(adifSource());
  if (selected.has("boletin")) jobs.push(boletinSource());
  if (selected.has("mendoza")) jobs.push(portalSource("mendoza"));
  const sources = (await Promise.all(jobs)).sort((a, b) => ARGENTINA_SOURCES.indexOf(a.id) - ARGENTINA_SOURCES.indexOf(b.id));

  // One slug, one row: a later source never overwrites an earlier one in the same batch.
  const unique = new Map<string, ArgentinaIngestResult["rows"][number]>();
  for (const row of rows) if (!unique.has(row.tender.slug)) unique.set(row.tender.slug, row);
  const finalRows = [...unique.values()];
  const kept = finalRows.filter((row) => row.tender.relevance.tier !== "excluded").map((row) => row.tender);

  const result: ArgentinaIngestResult = { sources, rows: finalRows, kept, write: options.write };
  if (sources.length > 0 && sources.every((source) => source.error)) {
    throw new Error(`阿根廷所有来源全部失败：${sources.map((source) => `${source.id}: ${source.error}`).join("；")}`);
  }
  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, kept);
  const keptSlugs = new Set(kept.map((tender) => tender.slug));
  const links = documentLinks.filter((entry) => keptSlugs.has(entry.slug));
  const saved = links.length > 0 ? await saveDocumentLinks(supabase, links) : null;
  return { ...result, upsertedCount, failed, documentLinks: saved?.linkCount ?? 0 };
}
