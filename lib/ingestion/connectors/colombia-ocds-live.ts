import type { OcdsRelease } from "@/lib/ingestion/types";

/**
 * Colombia Compra Eficiente's own official OCDS (Open Contracting Data
 * Standard) REST API — found by the user directly in CCE's own manual
 * (`operaciones.colombiacompra.gov.co/.../cce_manual_datos_abiertos.pdf`),
 * distinct from the two Socrata datasets `colombia-secop-live.ts` and
 * `colombia-documents-connector.ts` already use. Per that manual: GET-only,
 * no auth documented, real base URL and query params below (`start`/
 * `finish` as YYYY-MM-DD, `name` for buyer, `title`, `ocid`, `valueUp`/
 * `valueDown`, ...).
 *
 * UNVERIFIED SHAPE: this sandbox has no egress to `api.colombiacompra.gov.co`
 * (same block as every other real gov endpoint touched this session), so
 * the response ENVELOPE (does `/releases/` return `{releases: [...]}`, a
 * bare array, or something else — the manual's own screenshots only show
 * the query-parameter table, not a sample response body) and whether real
 * pagination exists beyond the `start`/`finish` date filter are both
 * unconfirmed. Parses defensively (accepts either a `{releases: [...]}`
 * envelope matching this project's existing OcdsReleasePackage shape, OR a
 * bare top-level array) and logs the raw response's top-level shape so the
 * first real run tells us which — same "confirmed real, not guessed" bar
 * as every other connector in this project, and the same honest-placeholder
 * posture as compras-mx-connector.ts.
 */
const COLOMBIA_OCDS_BASE_URL = "https://api.colombiacompra.gov.co/releases/";

function soqlDate(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, per the manual's documented `start`/`finish` format.
}

export type FetchColombiaOcdsOptions = {
  /** Only releases published on/after this date (server-side `start` filter). */
  sinceDate: Date;
};

export async function fetchColombiaOcdsReleases(options: FetchColombiaOcdsOptions): Promise<OcdsRelease[]> {
  const url = new URL(COLOMBIA_OCDS_BASE_URL);
  url.searchParams.set("start", soqlDate(options.sinceDate));
  url.searchParams.set("finish", soqlDate(new Date()));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Colombia OCDS API responded ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as unknown;

  // [diag] Unverified envelope — log the raw top-level shape once so a real
  // run's console tells us definitively which case this is, rather than
  // silently returning [] and looking like "no data" when it's actually a
  // parsing-assumption bug.
  if (Array.isArray(data)) {
    console.log(`  [diag] Colombia OCDS response is a bare array, ${data.length} item(s).`);
    return data as OcdsRelease[];
  }
  if (data && typeof data === "object" && Array.isArray((data as { releases?: unknown }).releases)) {
    const releases = (data as { releases: OcdsRelease[] }).releases;
    console.log(`  [diag] Colombia OCDS response has a "releases" envelope, ${releases.length} item(s).`);
    return releases;
  }
  console.log(
    `  [diag] Colombia OCDS response shape unrecognized — top-level keys: ${
      data && typeof data === "object" ? JSON.stringify(Object.keys(data as object)) : typeof data
    }`,
  );
  return [];
}
