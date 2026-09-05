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

/**
 * The REAL response shape (confirmed 2026-09-04 from actual server output,
 * not a guess) — despite the request being formatted as a DataTables
 * server-side-processing POST (draw/columns[]/order[]/start/length), the
 * response is DOF's own custom envelope, NOT the generic DataTables
 * {draw, recordsTotal, recordsFiltered, data} shape this file originally
 * assumed. Identical to dof-search-file.ts's DofSearchResponse (the shape
 * of a locally-saved capture) — that type was right all along; this live
 * connector's original DataTables-shaped assumption was the actual bug
 * (see the Eighth-pass README entry: two earlier fixes, date format and
 * the cookie jar, both turned out to be real but incomplete — this was
 * the last piece, found only once raw response logging showed the real
 * body: `{"messageCode":200,"response":"OK","totalRegistros":86,"Notas":[...]}`).
 */
type DofSearchResponse = {
  messageCode: number;
  totalRegistros: number;
  Notas?: DofSearchNota[];
};

/**
 * Live, server-side equivalent of DOF's advanced-search page (README's
 * "Technique 2" — previously only a manual DevTools Network capture).
 * Real request captured via "Copy as cURL" 2026-09-04, then a second real
 * capture the same day confirming it. Two-step: GET the search page first
 * to receive Set-Cookie, then POST with the FULL cookie jar attached, same
 * as a real browser session.
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
  let totalRegistros = Infinity;

  while (start < totalRegistros) {
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

    let data: DofSearchResponse;
    try {
      data = JSON.parse(rawText) as DofSearchResponse;
    } catch (err) {
      // A WAF/login-redirect page or an HTML error page would land here —
      // the old `res.json()` call would throw an unhelpful "unexpected
      // token" error with no context; this surfaces the actual response
      // body (truncated) so it's obvious the server sent something other
      // than the expected DOF JSON envelope.
      throw new Error(
        `DOF search: response wasn't valid JSON (${err instanceof Error ? err.message : String(err)}) — first 500 chars: ${rawText.slice(0, 500)}`,
      );
    }

    // JSON.parse() happily accepts a JSON-encoded STRING (e.g. an entire
    // HTML page as one big quoted string) and returns a JS string
    // primitive — property access on that (data.totalRegistros etc.) never
    // throws, it just silently returns undefined, which is indistinguishable
    // from "the search returned zero rows" unless checked explicitly.
    if (typeof data !== "object" || data === null || !("totalRegistros" in data)) {
      throw new Error(
        `DOF search: response was valid JSON but not the expected shape (got ${typeof data}, no "totalRegistros" field) — first 500 chars: ${rawText.slice(0, 500)}`,
      );
    }
    console.log(`[dof-search-live] messageCode=${data.messageCode}, totalRegistros=${data.totalRegistros}, Notas.length=${(data.Notas ?? []).length}`);

    all.push(...(data.Notas ?? []));
    totalRegistros = data.totalRegistros ?? all.length;
    start += PAGE_SIZE;
  }

  return all;
}
