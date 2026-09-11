import AdmZip from "adm-zip";
import type { OeceRecord, OeceRecordPackage } from "@/lib/ingestion/peru-oece-mapper";

/**
 * Live-fetches Peru's real OECE (formerly OSCE) open contracting data —
 * confirmed real end-to-end by the user directly (see
 * peru-oece-mapper.ts's header comment). Base URL confirmed real via a
 * live `Try it out` + `Execute` run in the user's own browser against
 * the Swagger docs at `contratacionesabiertas.oece.gob.pe/api`.
 *
 * `GET /file/{source}/{type}/{year}/{month}` returns a real ZIP archive
 * (`content-type: application/zip`) containing one JSON file with that
 * month's OCDS record package — genuinely unauthenticated, no anti-bot
 * gate encountered.
 */
const OECE_BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1";

/**
 * `.gob.pe` sits behind a WAF that answers 403 to a request carrying no
 * User-Agent at all, which is exactly what Node's fetch sends. The CLI runs
 * kept working (residential IP, and the WAF's reputation scoring is lenient
 * there) while the very same code called from the admin 秘鲁 tab came back
 * `OECE /recordsAfter responded 403 Forbidden for segment 2026-09`
 * (2026-09-11, reported by the user with a screenshot of that panel).
 *
 * Identifying the client honestly — a real product name and a contact URL,
 * which is what a public open-data API wants to see — is the fix. This is
 * NOT a browser impersonation string: nothing here claims to be Chrome, and
 * the point is to be MORE identifiable to the operator, not less.
 */
const OECE_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "es-PE,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** 403/429 from a WAF and 5xx from an overloaded origin are both routinely transient; a hard 404 or 400 is not, and retrying it only wastes the caller's time. */
const OECE_RETRYABLE_STATUSES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const OECE_MAX_ATTEMPTS = 4;

/**
 * One GET with bounded backoff (1s, 2s, 4s). Returns the LAST response rather
 * than throwing, so each call site keeps its own error message — those
 * messages name the segment/file being fetched, which is what makes a failure
 * in a multi-segment run actionable.
 */
async function fetchOece(url: string | URL): Promise<Response> {
  let response = await fetch(url, { headers: OECE_HEADERS });
  for (let attempt = 1; attempt < OECE_MAX_ATTEMPTS && OECE_RETRYABLE_STATUSES.has(response.status); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    response = await fetch(url, { headers: OECE_HEADERS });
  }
  return response;
}

export type OeceFileListing = {
  id: string;
  year: string;
  month: string;
  monthName: string;
  source: string;
  timestamp: string;
  files: { csv?: string; xlsx?: string; json?: string; sha?: string };
};

/**
 * `GET /files` — real response confirmed by the user: `{ "results": [...] }`,
 * most recent entry at the time `seace_v3-2026-08` (generated
 * 2026-09-01). These are complete-calendar-month batches, not a
 * rolling window — the current month stays invisible the whole time
 * it's in progress (confirmed: `GET /file/seace_v3/json/2026/09`
 * returned a real 404 on 2026-09-02), so real lag for the newest
 * tenders is ~1–30 days depending on where in the month they were
 * published, not a flat "~1 month" — see README.md's Peru section.
 * `page` mirrors the real query param seen in the Swagger UI.
 */
export async function listOeceFiles(page = 1): Promise<OeceFileListing[]> {
  const url = new URL(`${OECE_BASE_URL}/files`);
  url.searchParams.set("page", String(page));

  const response = await fetchOece(url);
  if (!response.ok) {
    throw new Error(`OECE /files responded ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { results: OeceFileListing[] };
  return body.results ?? [];
}

/**
 * Downloads one month's real ZIP and extracts the single JSON entry
 * inside it — confirmed real shape from the user's own download
 * (`2026-08_seace_v3_json.zip`, `content-disposition: attachment`).
 * Throws if the ZIP doesn't contain exactly the expected single `.json`
 * entry, rather than silently picking the wrong file.
 */
export async function downloadOeceRecordPackage(
  source: string,
  year: string,
  month: string,
): Promise<OeceRecordPackage> {
  const url = `${OECE_BASE_URL}/file/${source}/json/${year}/${month}`;
  // Same WAF as every other .gob.pe call here; the Accept: application/json
  // header is harmless on a ZIP download (the server ignores it) and the
  // User-Agent is the half that matters.
  const response = await fetchOece(url);
  if (!response.ok) {
    throw new Error(`OECE file download responded ${response.status} ${response.statusText} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  const zip = new AdmZip(Buffer.from(arrayBuffer));
  const jsonEntries = zip.getEntries().filter((entry) => entry.entryName.toLowerCase().endsWith(".json"));
  if (jsonEntries.length !== 1) {
    throw new Error(
      `Expected exactly one .json entry in the OECE zip for ${source}/${year}/${month}, found ${jsonEntries.length}`,
    );
  }

  const data = JSON.parse(jsonEntries[0].getData().toString("utf-8")) as OeceRecordPackage;
  return { records: Array.isArray(data.records) ? data.records : [] };
}

/**
 * ---------------------------------------------------------------------------
 * `GET /recordsAfter` — the live index, not the monthly bulk files above.
 * ---------------------------------------------------------------------------
 *
 * Why this exists (2026-09-11): the `/files` path above can only ever serve
 * COMPLETE calendar months, so the current month is invisible for its whole
 * duration — a tender published on the 1st waits ~30 days for the next file.
 * The user called that unacceptable, correctly.
 *
 * `/recordsAfter` is the same data out of the live index. Confirmed real by
 * the user against the Swagger docs at contratacionesabiertas.oece.gob.pe/api
 * and by a real response they pasted in full: the record package's own
 * `publishedDate` was the moment of the call, and individual records carried
 * `compiledRelease.date` values (2026-05-16, 2025-05-23) LATER than the month
 * file they belong to — i.e. the index keeps recompiling records after the
 * bulk file for their month was frozen.
 *
 * The trap, and why this takes `dataSegmentationID` rather than just paging:
 * `order=desc` does NOT mean newest-first. Decoding the real `searchAfter`
 * cursor from that response —
 *   seace_v3 , 999990 , 1709251200000 , 1713101395006 , ocds-...-999990-...
 *   (source)  (tenderId)  (2024-03-01)   (2024-04-14T08:29:55)  (releaseId)
 * — the sort is [sourceId, tenderId, segmentation month, compiled date,
 * release id], with tenderId sorted as a STRING. So "999999" outranks
 * "1245017" and page 1 of an unfiltered desc scan returns March 2024. Walking
 * from there to the current month means walking the entire dataset. The date
 * filters are the entry point, not the ordering.
 *
 * `dataSegmentationID` (YYYY-MM) is used here in preference to
 * `startDate`/`endDate` because it is the same key the monthly bulk files are
 * cut on, so "the September segment" means exactly what it means in
 * `/files` — no ambiguity about which of a tender's several dates is being
 * filtered. The Swagger text for startDate/endDate describes them as "desde
 * que se comenzó el periodo de licitación" (the tender PERIOD, not
 * datePublished) and both entries circularly reference startDate, which reads
 * like a documentation bug; and real records exist with no `tenderPeriod` at
 * all (a Contratación Directa in the user's own sample), which such a filter
 * could silently drop. Segment selection has neither problem.
 */
export type OeceRecordsQuery = {
  /**
   * Segment to fetch, `YYYY-MM` — the same key `/files` cuts months on.
   *
   * Sent as `dataSegmentationID`, with that exact capitalisation. The API
   * SILENTLY IGNORES query parameters it does not recognise: the user tried
   * `dataSegmentation=2026-09` and `year=2026&month=09` against the live
   * endpoint (2026-09-11) and both came back 200 with the unfiltered first
   * page — March 2024 — while echoing the bogus parameter back in the
   * response's own `uri` field. A typo here does not fail; it quietly hands
   * back the whole dataset. assertSegmentHonoured() below is the guard.
   */
  dataSegmentationId: string;
  /** Defaults to seace_v3 (the current system). seace_v2 also carries V1 data. */
  sourceId?: string;
  /** Server-side `goods`/`works`/`services` filter. Deliberately unset by
   * default: what is worth keeping is `lib/relevance.ts`'s decision, not the
   * fetch layer's, and Peru's own categories do not map onto that judgement
   * (a cybersecurity contract is `services`, a substation buy is `goods`).
   * Exposed only for cheap exploration of one category. */
  mainProcurementCategory?: "goods" | "works" | "services";
};

/** Swagger: "debe ser inferior o igual a 100" (default 10). */
const OECE_MAX_PAGE_SIZE = 100;

/**
 * Hard stop on cursor-following. A segment is one calendar month of Peruvian
 * public procurement; at 100 records a page this allows 200k records in a
 * month, comfortably above any real figure, while still guaranteeing the loop
 * terminates if `links.next` ever cycles.
 */
const OECE_MAX_PAGES_PER_SEGMENT = 2000;

/**
 * Fetches every record in one `YYYY-MM` segment by following the OCDS
 * pagination extension's `links.next` cursor until it comes back null.
 *
 * `onPage` reports progress to a CLI without this needing to know about one.
 */
/**
 * Fails fast when the server ignored `dataSegmentationID` — see that field's
 * comment for the real 200-with-unfiltered-data behaviour this exists for.
 *
 * Checks the FIRST page only: one page is enough to tell "this query was
 * filtered" from "this query was not", and re-checking every page would cost
 * nothing but also catch nothing new. An empty first page is not a failure
 * (a month with no matching records is a legitimate answer, and is exactly
 * what an early-in-the-month current segment can look like).
 */
function assertSegmentHonoured(requested: string, records: OeceRecord[]): void {
  if (records.length === 0) return;
  const returned = records[0]?.compiledRelease?.dataSegmentation?.id;
  if (returned && returned !== requested) {
    throw new Error(
      `OECE ignored dataSegmentationID=${requested}: the first record came back in segment ${returned}. ` +
        "The API answers 200 and returns the whole unfiltered dataset when it does not recognise a query " +
        "parameter, so this is almost certainly a parameter-name or casing change on their side — re-check " +
        "https://contratacionesabiertas.oece.gob.pe/api before trusting any Peru import.",
    );
  }
}

export async function fetchOeceRecordsForSegment(
  query: OeceRecordsQuery,
  onPage?: (pageIndex: number, recordsSoFar: number) => void,
): Promise<OeceRecord[]> {
  const url = new URL(`${OECE_BASE_URL}/recordsAfter`);
  url.searchParams.set("format", "json");
  url.searchParams.set("size", String(OECE_MAX_PAGE_SIZE));
  url.searchParams.set("sourceId", query.sourceId ?? "seace_v3");
  url.searchParams.set("dataSegmentationID", query.dataSegmentationId);
  if (query.mainProcurementCategory) {
    url.searchParams.set("mainProcurementCategory", query.mainProcurementCategory);
  }

  const records: OeceRecord[] = [];
  // Keyed by ocid so a record that somehow appears twice across pages (a
  // re-compile landing mid-scroll) is stored once, last write winning.
  const seen = new Map<string, OeceRecord>();
  let next: string | null = url.toString();
  let checkedFirstPage = false;

  for (let page = 0; next && page < OECE_MAX_PAGES_PER_SEGMENT; page++) {
    const response: Response = await fetchOece(next);
    if (!response.ok) {
      throw new Error(
        `OECE /recordsAfter responded ${response.status} ${response.statusText} for segment ${query.dataSegmentationId}`,
      );
    }
    const body = (await response.json()) as {
      records?: OeceRecord[];
      links?: { next?: string | null };
    };

    if (!checkedFirstPage) {
      assertSegmentHonoured(query.dataSegmentationId, body.records ?? []);
      checkedFirstPage = true;
    }

    for (const record of body.records ?? []) {
      if (record?.ocid) seen.set(record.ocid, record);
    }
    onPage?.(page + 1, seen.size);

    // A page that returns nothing ends the scroll even if links.next is set —
    // otherwise an empty segment would spin to the page cap.
    if ((body.records ?? []).length === 0) break;
    next = body.links?.next ?? null;
  }

  records.push(...seen.values());
  return records;
}

/**
 * The last `months` calendar-month segments, newest first, INCLUDING the
 * current (in-progress) month — which is the entire reason this path exists.
 * Built off UTC parts so the list can't shift under a machine's local zone.
 */
export function recentSegmentIds(months: number, now: Date = new Date()): string[] {
  const count = months > 0 ? months : 1;
  const segments: string[] = [];
  for (let back = 0; back < count; back++) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    segments.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return segments;
}
