/**
 * A CKAN client, written against CKAN's own documented Action API rather than
 * against any one portal.
 *
 * CKAN (ckan.org) is the open-source data portal the Brazilian federal
 * government standardised on, so ANEEL, CCEE, ANTT, ANTAQ and dados.gov.br
 * each *may* expose the same three calls under their own hostname. "May" is
 * the operative word and the reason this file contains no hostnames and no
 * dataset ids: which portals actually run CKAN, and what their datasets are
 * called, is measured by scripts/probe-brazil-concessions.ts, not recalled
 * here. This project has already paid for the other habit once — a guessed
 * dadosabertos path returned 404 in 1.2 seconds from a host that was up (see
 * lib/ingestion/README.md, "Brazil — the other doors").
 *
 * What IS safe to write in advance is the protocol, because it is a published
 * standard and identical across installs:
 *
 *   GET {base}/api/3/action/status_show        → is this CKAN, and which version
 *   GET {base}/api/3/action/package_search     → datasets matching a query
 *   GET {base}/api/3/action/package_show       → one dataset and its resources
 *   GET {base}/api/3/action/datastore_search   → rows and COLUMN NAMES of a resource
 *
 * The fourth is the one that matters for a mapper. A CKAN resource is usually
 * a CSV/XLSX file, but when `datastore_active` is true the same data is also
 * queryable as JSON with its columns typed — which turns "download a
 * spreadsheet and guess the headers" into "ask the API what the headers are".
 * Prefer it wherever it exists.
 *
 * Two shape facts that decide whether calling code is correct:
 *
 *  - **Every response is wrapped**: `{ success: boolean, result: T, error?: … }`,
 *    and a FAILED call can still arrive as HTTP 200 with `success: false`.
 *    Reading `body.result` without checking `success` is how a CKAN client
 *    silently reports an error as an empty result set, so `action()` below
 *    throws on it.
 *  - **`package_search` counts, `datastore_search` totals.** The dataset
 *    search returns `{ count, results }` while the row search returns
 *    `{ total, fields, records }`. They are different envelopes from the same
 *    API; the types below keep them apart rather than unifying them into
 *    something neither endpoint returns.
 */
import { describeFetchFailure } from "@/lib/fetch-failure";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  // Same posture as the PNCP and Peru connectors: identify honestly rather
  // than impersonate a browser, so a public open-data portal can throttle
  // this caller specifically if it wants to.
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

export type CkanStatus = {
  ckanVersion: string | null;
  siteTitle: string | null;
  extensions: string[];
};

export type CkanResource = {
  id?: string;
  name?: string;
  description?: string;
  format?: string;
  url?: string;
  /** True when the resource's rows are queryable through `datastore_search`. */
  datastore_active?: boolean;
  last_modified?: string | null;
  created?: string | null;
  size?: number | null;
};

export type CkanPackage = {
  id?: string;
  /** The URL slug — this, not `id`, is what `package_show` takes most readably. */
  name?: string;
  title?: string;
  notes?: string | null;
  metadata_modified?: string;
  organization?: { name?: string; title?: string } | null;
  resources?: CkanResource[];
  tags?: { name?: string; display_name?: string }[];
};

export type CkanPackageSearch = {
  count: number;
  results: CkanPackage[];
};

export type CkanDatastoreSearch = {
  total: number;
  /** The column contract — `{ id: "NomLeilao", type: "text" }`. A mapper is written from this. */
  fields: { id?: string; type?: string }[];
  records: Record<string, unknown>[];
};

export type CkanError = Error & {
  ckanStatus?: number | string;
  /**
   * The response headers, when there was a response.
   *
   * Carried on the error because the diagnostic that matters most is usually
   * there and nowhere else: a 401 with an empty body says nothing, while its
   * `WWW-Authenticate` says exactly which credential the portal wants, and a
   * WAF block page is identified by `server` / `cf-ray` rather than by its
   * HTML. Both are how a caller learns what to send next.
   */
  ckanHeaders?: Record<string, string>;
};

function fail(message: string, status?: number | string, headers?: Record<string, string>): CkanError {
  const error = new Error(message) as CkanError;
  if (status !== undefined) error.ckanStatus = status;
  if (headers !== undefined) error.ckanHeaders = headers;
  return error;
}

/** Options every call takes. `headers` overrides or adds to the defaults — see the note on HEADERS above. */
export type CkanRequestOptions = { timeoutMs?: number; headers?: Record<string, string> };

/**
 * One Action API call.
 *
 * `timeoutMs` is generous by default because these portals are file servers
 * first and APIs second — a `datastore_search` against a large resource can
 * take tens of seconds on a cold cache.
 */
export async function ckanAction<T>(
  base: string,
  action: string,
  params: Record<string, string | number | undefined> = {},
  options: CkanRequestOptions = {},
): Promise<T> {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  const url = `${base.replace(/\/+$/, "")}/api/3/action/${action}${query ? `?${query}` : ""}`;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text: string;
  let httpStatus: number;
  let responseHeaders: Record<string, string> = {};
  try {
    const response = await fetch(url, { headers: { ...HEADERS, ...options.headers }, signal: controller.signal });
    httpStatus = response.status;
    responseHeaders = Object.fromEntries(response.headers.entries());
    text = await response.text();
  } catch (err) {
    // The whole cause chain, never the bare "fetch failed" — DNS, TLS refusal,
    // reset and connect timeout all print identically otherwise, and they need
    // four different fixes. Same lesson as lib/fetch-failure.ts's own header.
    throw fail(`${action}: ${describeFetchFailure(err)}`, "network");
  } finally {
    clearTimeout(timer);
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    throw fail(`${action}: HTTP ${httpStatus} — ${text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`, httpStatus, responseHeaders);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // A CKAN portal that is really a CMS page answers 200 with HTML. Saying so
    // is the finding; "invalid JSON" is not.
    throw fail(`${action}: answered ${httpStatus} with something that is not JSON (${text.trim().slice(0, 120)})`, httpStatus, responseHeaders);
  }

  const envelope = body as { success?: boolean; result?: unknown; error?: unknown };
  if (envelope.success !== true) {
    const detail = typeof envelope.error === "object" && envelope.error !== null ? JSON.stringify(envelope.error).slice(0, 200) : String(envelope.error ?? "no error object");
    throw fail(`${action}: CKAN answered HTTP ${httpStatus} but success=false — ${detail}`, httpStatus, responseHeaders);
  }
  return envelope.result as T;
}

/** Confirms the host really is CKAN before anything else is read into it. */
export async function ckanStatus(base: string, options?: CkanRequestOptions): Promise<CkanStatus> {
  const result = await ckanAction<{ ckan_version?: string; site_title?: string; extensions?: string[] }>(base, "status_show", {}, options);
  return {
    ckanVersion: result.ckan_version ?? null,
    siteTitle: result.site_title ?? null,
    extensions: Array.isArray(result.extensions) ? result.extensions : [],
  };
}

export async function ckanPackageSearch(
  base: string,
  params: { q?: string; rows?: number; start?: number; sort?: string },
  options?: CkanRequestOptions,
): Promise<CkanPackageSearch> {
  const result = await ckanAction<{ count?: number; results?: CkanPackage[] }>(
    base,
    "package_search",
    { q: params.q, rows: params.rows ?? 20, start: params.start, sort: params.sort },
    options,
  );
  return { count: result.count ?? 0, results: Array.isArray(result.results) ? result.results : [] };
}

export async function ckanPackageShow(base: string, id: string, options?: CkanRequestOptions): Promise<CkanPackage> {
  return ckanAction<CkanPackage>(base, "package_show", { id }, options);
}

/**
 * Rows AND column names for one resource.
 *
 * Only works where `datastore_active` is true on the resource; elsewhere CKAN
 * answers success=false and `ckanAction` throws, which is the correct outcome
 * — it means the mapper has to read the file itself.
 */
export async function ckanDatastoreSearch(
  base: string,
  params: { resourceId: string; limit?: number; q?: string },
  options?: CkanRequestOptions,
): Promise<CkanDatastoreSearch> {
  const result = await ckanAction<{ total?: number; fields?: { id?: string; type?: string }[]; records?: Record<string, unknown>[] }>(
    base,
    "datastore_search",
    { resource_id: params.resourceId, limit: params.limit ?? 5, q: params.q },
    options,
  );
  return {
    total: result.total ?? 0,
    fields: Array.isArray(result.fields) ? result.fields : [],
    records: Array.isArray(result.records) ? result.records : [],
  };
}
