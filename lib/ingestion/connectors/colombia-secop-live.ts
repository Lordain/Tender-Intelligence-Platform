import type { SecopProcesoRow } from "@/lib/ingestion/colombia-mapper";

/**
 * Live-fetches Colombia's real SECOP II "Procesos de Contratación" Socrata
 * dataset directly — the same confirmed real, unauthenticated endpoint
 * `colombia-mapper.ts` documents (`p6dx-8zbt`), but pulled over the network
 * instead of read from a file a human captured by hand first. This is the
 * automated counterpart to the manual "Direct browser request" technique in
 * README.md's operating runbook — the same role `colombia-documents-connector.ts`
 * already fills for SECOP II's document downloads.
 *
 * 9,097,326 rows total as of colombia-mapper.ts's writing — far too many to
 * page through in full, so this always applies a server-side `$where` date
 * filter (`fecha_de_publicacion_del >= <sinceDate>`) rather than fetching
 * everything and filtering client-side the way `filterRecentTenders()` does
 * for file-based sources. `$order=fecha_de_publicacion_del DESC` means a
 * `maxPages` cap (rather than paging until Socrata returns an empty page)
 * still gets the most recently published rows first if the real window
 * turns out to be larger than expected.
 */
const SECOP_BASE_URL = "https://www.datos.gov.co/resource/p6dx-8zbt.json";
const PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 20; // 20,000 rows — generous for a 6-month window; raise via maxPages if a real run needs more.

export type FetchSecopProcesosOptions = {
  /** Only rows published on/after this date are fetched (server-side, via $where) — required, since a full dump isn't viable. */
  sinceDate: Date;
  /** Safety cap on how many 1,000-row pages to pull, in case the real window is larger than expected. */
  maxPages?: number;
};

function soqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19); // "yyyy-MM-ddTHH:mm:ss" — SoQL floating_timestamp literal, no trailing "Z"/milliseconds.
}

export async function fetchSecopProcesos(options: FetchSecopProcesosOptions): Promise<SecopProcesoRow[]> {
  const { sinceDate, maxPages = DEFAULT_MAX_PAGES } = options;
  const whereClause = `fecha_de_publicacion_del >= '${soqlTimestamp(sinceDate)}'`;

  const rows: SecopProcesoRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(SECOP_BASE_URL);
    url.searchParams.set("$where", whereClause);
    url.searchParams.set("$order", "fecha_de_publicacion_del DESC");
    url.searchParams.set("$limit", String(PAGE_SIZE));
    url.searchParams.set("$offset", String(page * PAGE_SIZE));

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`SECOP procesos API responded ${response.status} ${response.statusText} (page ${page})`);
    }
    const pageRows = (await response.json()) as SecopProcesoRow[];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) break; // last page — fewer rows than requested means nothing left.
  }

  return rows;
}
