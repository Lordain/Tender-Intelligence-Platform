import type { DofSearchNota } from "@/lib/ingestion/dof-search-mapper";

const BASE_URL = "https://sidof.segob.gob.mx";
const SEARCH_PAGE_PATH = "/busquedaAvanzada/busqueda";
const SEARCH_ENDPOINT = "/busqueda/CargaNotasAvanzadas/";
const PAGE_SIZE = 100;

// Node's fetch() sends no User-Agent by default (or a non-browser one,
// depending on runtime) — added defensively alongside the full-cookie-jar
// fix above, on the same "make this indistinguishable from a real browser
// request" reasoning, given the WAF/CDN-looking cookie noted there. Real
// value copied from the user's own real "Copy as cURL" capture (2026-09-04).
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

// The DataTables column/order boilerplate is fixed — copied verbatim
// from a real "Copy as cURL" capture of the advanced-search page's own
// request (2026-09-04), never varies with the search terms.
const DATATABLES_COLUMNS = [
  { data: "fecha" },
  { data: "titulo" },
  { data: "codOrgaUno" },
  { data: "codOrgaDos" },
] as const;

function buildBody(params: { texto: string; fechaIni: string; fechaFin: string; idOrg: string; start: number }): URLSearchParams {
  const body = new URLSearchParams();
  body.set("draw", "1");
  DATATABLES_COLUMNS.forEach((col, i) => {
    body.set(`columns[${i}][data]`, col.data);
    body.set(`columns[${i}][name]`, "");
    body.set(`columns[${i}][searchable]`, "true");
    body.set(`columns[${i}][orderable]`, "true");
    body.set(`columns[${i}][search][value]`, "");
    body.set(`columns[${i}][search][regex]`, "false");
  });
  body.set("order[0][column]", "0");
  body.set("order[0][dir]", "desc");
  body.set("start", String(params.start));
  body.set("length", String(PAGE_SIZE));
  body.set("search[value]", "");
  body.set("search[regex]", "false");
  body.set("tipoBus", "T");
  body.set("textoBus", params.texto);
  body.set("fechaIni", params.fechaIni);
  body.set("fechaFin", params.fechaFin);
  body.set("idOrg", params.idOrg);
  body.set("sinonimos", "false");
  body.set("tipoTexto", "Y");
  return body;
}

type DataTablesResponse = {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: DofSearchNota[];
};

/**
 * Live, server-side equivalent of DOF's advanced-search page (README's
 * "Technique 2" — previously only a manual DevTools Network capture).
 * Real request captured via "Copy as cURL" 2026-09-04, then a second real
 * capture the same day confirming it. Two-step: GET the search page first
 * to receive Set-Cookie, then POST with the FULL cookie jar attached, same
 * as a real browser session.
 *
 * Confirmed real bug (2026-09-04): the very first live run returned 0
 * results for a search the user then confirmed by hand has real hits —
 * root-caused to fechaIni/fechaFin format (now fixed at the caller, see
 * ImportDofSearchForm.tsx's isoToDofDate()). If results are STILL empty
 * after that fix, the next suspect is this cookie handling: the real
 * capture's Cookie header carries several OTHER cookies beyond ci_session
 * (one with an unusual, WAF/CDN-looking name — "UrtK5jLykjmM...") that an
 * earlier version of this function silently dropped, forwarding only
 * ci_session. Forwarding every cookie the initial GET sets — not
 * cherry-picking ci_session alone — removes that as a possible cause,
 * since there's no confirmed proof yet that ci_session alone is
 * sufficient (only that it's necessary).
 */
export async function fetchDofSearchLive(params: { texto: string; fechaIni: string; fechaFin: string; idOrg?: string }): Promise<DofSearchNota[]> {
  const idOrg = params.idOrg ?? "PE,PL,PJ,OA,EPEM,EF,OD,AV,CV,VG,TODOS";

  const searchPageUrl = `${BASE_URL}${SEARCH_PAGE_PATH}?tipo=T&tipotexto=Y&texto=${encodeURIComponent(params.texto)}&fechainicio=${params.fechaIni}&fechahasta=${params.fechaFin}&organismos=${idOrg}&sinonimos=false`;

  const sessionRes = await fetch(searchPageUrl, { headers: { "User-Agent": BROWSER_USER_AGENT } });
  const setCookies = typeof sessionRes.headers.getSetCookie === "function" ? sessionRes.headers.getSetCookie() : sessionRes.headers.get("set-cookie") ? [sessionRes.headers.get("set-cookie")!] : [];
  // Forward the whole cookie jar (just the name=value pair each Set-Cookie
  // starts with, dropping its own Path/HttpOnly/... attributes) rather than
  // isolating just ci_session — see header comment above.
  const cookieHeader = setCookies.map((c) => c.split(";")[0]?.trim()).filter(Boolean).join("; ");
  if (!cookieHeader || !/ci_session=/.test(cookieHeader)) {
    throw new Error("DOF search: didn't receive a ci_session cookie from the search page — the site may have changed how it issues sessions.");
  }
  // Diagnostic logging (2026-09-04) — two real fixes (date format, then
  // cookie jar) both still came back "0 results, no error" on the next live
  // run, which gives no visibility into WHY. Printed to the server console
  // (wherever `next dev`/`next start` is running) so the admin can see
  // exactly what this function received back, not just the UI's final
  // zero-everything summary.
  console.log(`[dof-search-live] GET ${searchPageUrl} -> HTTP ${sessionRes.status}; cookies received: ${setCookies.length} (forwarding: ${cookieHeader})`);

  const all: DofSearchNota[] = [];
  let start = 0;
  let recordsTotal = Infinity;

  while (start < recordsTotal) {
    const res = await fetch(`${BASE_URL}${SEARCH_ENDPOINT}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: BASE_URL,
        Referer: searchPageUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": BROWSER_USER_AGENT,
        Cookie: cookieHeader,
      },
      body: buildBody({ texto: params.texto, fechaIni: params.fechaIni, fechaFin: params.fechaFin, idOrg, start }),
    });

    const rawText = await res.text();
    console.log(`[dof-search-live] POST ${SEARCH_ENDPOINT} (start=${start}) -> HTTP ${res.status}, content-type: ${res.headers.get("content-type")}, body length: ${rawText.length}`);
    // Unconditional, regardless of whether JSON.parse below succeeds — a
    // response that parses "successfully" into something with no
    // recordsTotal/data (like a JSON-encoded STRING containing an entire
    // HTML page, which JSON.parse happily accepts and returns as a JS
    // string primitive — property access on it just silently returns
    // undefined, no throw) needs this raw preview to actually diagnose,
    // since the parse-succeeded/parse-failed branching alone can't tell
    // that story.
    console.log(`[dof-search-live] raw body preview: ${JSON.stringify(rawText.slice(0, 300))}`);

    if (!res.ok) {
      throw new Error(`DOF search request failed: HTTP ${res.status} ${res.statusText} — body: ${rawText.slice(0, 500)}`);
    }

    let data: DataTablesResponse;
    try {
      data = JSON.parse(rawText) as DataTablesResponse;
    } catch (err) {
      // A WAF/login-redirect page or an HTML error page would land here —
      // the old `res.json()` call would throw an unhelpful "unexpected
      // token" error with no context; this surfaces the actual response
      // body (truncated) so it's obvious the server sent something other
      // than the expected DataTables JSON.
      throw new Error(
        `DOF search: response wasn't valid JSON (${err instanceof Error ? err.message : String(err)}) — first 500 chars: ${rawText.slice(0, 500)}`,
      );
    }

    // JSON.parse() happily accepts a JSON-encoded STRING (e.g. an entire
    // HTML page as one big quoted string) and returns a JS string
    // primitive — property access on that (data.recordsTotal etc.) never
    // throws, it just silently returns undefined, which is indistinguishable
    // from "the search returned zero rows" unless checked explicitly. This
    // is exactly the failure mode a real run hit (2026-09-04): HTTP 200,
    // Content-Type text/html, a real 57KB body, valid JSON syntax — but not
    // the DataTables shape, so the old code silently treated it as "0
    // results" instead of surfacing that something else entirely came back.
    if (typeof data !== "object" || data === null || !("recordsTotal" in data)) {
      throw new Error(
        `DOF search: response was valid JSON but not the expected DataTables shape (got ${typeof data}, no "recordsTotal" field) — first 500 chars: ${rawText.slice(0, 500)}`,
      );
    }
    console.log(`[dof-search-live] recordsTotal=${data.recordsTotal}, recordsFiltered=${data.recordsFiltered}, data.length=${(data.data ?? []).length}`);

    all.push(...(data.data ?? []));
    recordsTotal = data.recordsTotal ?? all.length;
    start += PAGE_SIZE;
  }

  return all;
}
