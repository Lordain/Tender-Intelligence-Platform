import type { DofSearchNota } from "@/lib/ingestion/dof-search-mapper";

const BASE_URL = "https://sidof.segob.gob.mx";
const SEARCH_PAGE_PATH = "/busquedaAvanzada/busqueda";
const SEARCH_ENDPOINT = "/busqueda/CargaNotasAvanzadas/";
const PAGE_SIZE = 100;

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
 * Real request captured via "Copy as cURL" 2026-09-04: a routine
 * `ci_session` cookie (set on any visit to the site, not a deliberate
 * anti-bot challenge — confirmed no grc/igrc/xgrc header) plus a full
 * DataTables-format POST body. Two-step: GET the search page first to
 * receive that cookie via Set-Cookie, then POST with it attached, same
 * as a real browser session.
 *
 * NOT yet exercised against the real endpoint from this session (this
 * sandbox has no network egress to *.gob.mx) — the request shape isn't
 * a guess, it's copied field-for-field from the user's own real capture,
 * but the first live run should be watched once before trusting it at
 * scale.
 */
export async function fetchDofSearchLive(params: { texto: string; fechaIni: string; fechaFin: string; idOrg?: string }): Promise<DofSearchNota[]> {
  const idOrg = params.idOrg ?? "PE,PL,PJ,OA,EPEM,EF,OD,AV,CV,VG,TODOS";

  const searchPageUrl = `${BASE_URL}${SEARCH_PAGE_PATH}?tipo=T&tipotexto=Y&texto=${encodeURIComponent(params.texto)}&fechainicio=${params.fechaIni}&fechahasta=${params.fechaFin}&organismos=${idOrg}&sinonimos=false`;

  const sessionRes = await fetch(searchPageUrl);
  const setCookies = typeof sessionRes.headers.getSetCookie === "function" ? sessionRes.headers.getSetCookie() : [sessionRes.headers.get("set-cookie") ?? ""];
  const ciSession = setCookies.map((c) => /ci_session=[^;]+/.exec(c)?.[0]).find(Boolean);
  if (!ciSession) {
    throw new Error("DOF search: didn't receive a ci_session cookie from the search page — the site may have changed how it issues sessions.");
  }

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
        Cookie: ciSession,
      },
      body: buildBody({ texto: params.texto, fechaIni: params.fechaIni, fechaFin: params.fechaFin, idOrg, start }),
    });

    if (!res.ok) {
      throw new Error(`DOF search request failed: HTTP ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as DataTablesResponse;
    all.push(...(data.data ?? []));
    recordsTotal = data.recordsTotal ?? all.length;
    start += PAGE_SIZE;
  }

  return all;
}
