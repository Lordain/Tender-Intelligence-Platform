import { egressDenial, describeEgressDenial } from "@/lib/ingestion/egress-denial";

/**
 * Chile — Mercado Público's public tender SEARCH, the third door.
 *
 * Round 2 opened ChileCompra's OCDS export and then measured that it stopped
 * publishing on 2026-07-29. This is the door that is still live. It sits in
 * front of the same corpus, needs no credential at all, and — measured
 * 2026-09-24 — carries tenders published THAT DAY.
 *
 * The OCDS connector is NOT replaced by this one. It stays: it is structured,
 * CC0, versioned OCDS 1.1, carries a region field this door does not, and it
 * starts working again by itself if ChileCompra resumes. See ingest-chile.ts.
 *
 * ── What this door is ─────────────────────────────────────────────────────
 *
 *   POST /BuscarLicitacion//Home/GenerarArchivo   → {FileGuid, nombreArchivo, estado}
 *   GET  /BuscarLicitacion//Home/Descargar?fileGuid=…&nombreArchivo=…  → a CSV
 *   POST /BuscarLicitacion//Home/Buscar           → an HTML fragment
 *
 * The doubled slash is not a typo and not cosmetic: it is what the site's own
 * `busqueda.js` builds (`rutaInicial` is `/BuscarLicitacion/` and the download
 * controllers are appended as `/Home/…`). It is sent exactly as the browser
 * sends it.
 *
 * ── The export is real, and that is the whole finding ─────────────────────
 *
 * `GenerarArchivo` hands back a real `ListaLicitaciones.csv`: UTF-8 with BOM,
 * `;`-delimited, CRLF, 11 columns. Measured over 4,055 rows on 2026-09-24:
 * zero quote characters, zero bare LFs, and every single row exactly 11
 * fields — the server strips its own delimiters out of the free-text columns
 * before writing them. So this door is "read a structured file", not "parse a
 * UI's HTML", which is roughly an order of magnitude less fragile.
 *
 * HTML parsing is the FALLBACK, and it is still needed for exactly one field:
 * the CSV has no closing date. See fetchChileBuscaSearchHtml().
 *
 * ── Four responses here that are NOT what their status code says ──────────
 *
 * 1. HTTP 200, `content-length: 0`, on `Descargar`. The generated file lives
 *    in server-side session state, so the download only works if it carries
 *    the cookies the GenerarArchivo call set. Without them you get a 200 and
 *    an empty body — a "successful" import of nothing. warmSession() exists
 *    for this and assertCsvBody() refuses the empty one.
 *
 * 2. HTTP 200 + `{"estado":false}` on GenerarArchivo. That is a REFUSAL. It is
 *    what an empty or multi-valued `idTipoFecha` produces. See
 *    ChileBuscaRefusedError.
 *
 * 3. HTTP 200 + a CSV with a header row and nothing under it (134 bytes).
 *    That is the honest "this page is past the end" answer AND the answer to
 *    `idTipoFecha: "-1"`, which is not a valid bucket — identical bytes, two
 *    opposite meanings. Only the caller's own paging position tells them
 *    apart, which is why CHILE_BUSCA_DATE_BUCKETS is an explicit list rather
 *    than a "-1 means all" shortcut.
 *
 * 4. HTTP 403 with `x-deny-reason` — our own container's egress gateway, not
 *    Chile. Round 1's discriminator (egress-denial.ts) runs before any status
 *    is read as meaning anything, same as the OCDS connector.
 *
 * ── Being a good citizen of someone else's front end ──────────────────────
 *
 * This is a public page any citizen can open and the data is CC0, but it is
 * ChileCompra's UI, not a published data API. It carries no stability promise.
 * So: an honest User-Agent naming the product and a contact URL (never a
 * browser impersonation string), strictly serial requests, a deliberate pause
 * between them, and bounded retry. The whole 4,055-row corpus costs 15
 * requests through the export — which is itself the politest reason to prefer
 * it over walking 406 pages of HTML at 10 rows each.
 */

const CHILE_BUSCA_BASE = "https://www.mercadopublico.cl/BuscarLicitacion/";

/**
 * Same posture as chile-ocds-live.ts and every other connector here: a real
 * product name and a contact URL, so ChileCompra can see who is calling and
 * throttle this caller specifically. Nothing here claims to be a browser.
 */
export const CHILE_BUSCA_HEADERS = {
  Accept: "text/html, application/json, */*; q=0.01",
  "Accept-Language": "es-CL,es;q=0.9",
  "User-Agent":
    "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Their own export page size. `registrosPorPagina` is IGNORED by both endpoints — measured at 10, 100, 500 and 1000, all served 1000 rows in the CSV and 10 cards in the HTML. */
export const CHILE_BUSCA_EXPORT_PAGE_SIZE = 1000;

/** The HTML fragment's page size, likewise not negotiable. */
export const CHILE_BUSCA_HTML_PAGE_SIZE = 10;

/** Deliberate spacing between requests. Not a rate limit we were given — a rate limit we chose. */
export const CHILE_BUSCA_REQUEST_SPACING_MS = 1500;

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

/**
 * The script bundle version the parser was written against.
 *
 * Every `busqueda*.js` and the result-page CSS are served with
 * `?v=202502171638`. The HTML this parser reads is rendered by that bundle's
 * server side. When this string changes on the live site, the HTML parser is
 * SUSPECT and the fixtures want re-capturing — that is the single cheapest
 * early warning this door offers, so it is recorded in code rather than only
 * in the README. It is not checked automatically: a version bump is not by
 * itself a breakage, and failing an import over one would be worse than the
 * drift it guards against.
 */
export const CHILE_BUSCA_SCRIPT_VERSION = "202502171638";

/**
 * Mercado Público's own estado codes, read off `busqueda.filtros.js` and then
 * CROSS-CHECKED against what the server actually returns.
 *
 * Round 2 left this gap open explicitly ("码表没量过，所以一个字都没读"). It is
 * closed now, and by two independent sources rather than one: each code below
 * was sent, and the `Estado` column of the returned CSV carried exactly one
 * distinct value — the text quoted beside it. `5` was additionally confirmed
 * against OCDS, whose `statusDetails` reads "5-Publicada" on the same tenders.
 *
 * `-1` genuinely means "todos" HERE (it returned six distinct Estado texts,
 * including a "Suspendida" that has no code of its own in the site's table) —
 * unlike `idTipoFecha`, where `-1` is silently zero rows. Two fields, same
 * sentinel, different meanings.
 */
export const CHILE_BUSCA_ESTADOS = {
  todos: "-1",
  /** "Publicada y disponible para ofertar" — the only one this importer asks for. */
  publicadas: "5",
  /** "Cerrada a recibir más ofertas" */
  cerradas: "6",
  /** "Sin ofertas recibidas" */
  desiertas: "7",
  /** "Adjudicada a uno o varios proveedores" */
  adjudicadas: "8",
  /** "Cancelada por el organismo" */
  revocadas: "15",
} as const;

/**
 * The closing-date buckets, which are MANDATORY and single-valued.
 *
 * `idTipoFecha` is the site's "Fecha de cierre" checkbox group: 1 = este mes,
 * 2 = próximo mes, 3 = 3 meses o más. Measured, all four ways:
 *
 *   ""       → {"estado":false}      a refusal
 *   "1,2,3"  → {"estado":false}      a refusal; the JS collects an array but the server takes one
 *   "-1"     → 200, header-only CSV  zero rows, looking exactly like "past the end"
 *   "1"/"2"/"3" → 1041 / 1197 / 9 rows (público half, 2026-09-24)
 *
 * So there is no "all dates" value, and the field cannot be left out. Covering
 * the corpus means asking for each bucket in turn. This is the single most
 * expensive thing to get wrong on this door: a caller who sends the site's own
 * default `"1"` and stops — which is what a copied-from-devtools payload does —
 * silently receives only the tenders closing THIS MONTH.
 */
export const CHILE_BUSCA_DATE_BUCKETS = ["1", "2", "3"] as const;

/**
 * Whether the estimated amount is published — and the trap in the middle of it.
 *
 * `-1` reads like "todos" because that is what it means for `codigoRegion`,
 * `idTipoLicitacion` and `idEstado`. It does not mean that here. Measured on
 * 2026-09-24 with everything else held equal:
 *
 *   esPublicoMontoEstimado "-1" → 1047 rows
 *   esPublicoMontoEstimado "1"  → 1047 rows, the SAME 1047 (0 differences)
 *   esPublicoMontoEstimado "0"  →  770 rows, DISJOINT from those (intersection 0)
 *
 * `-1` is an alias for `1`. The 770 rows whose amount is not published are
 * reachable only by asking for `0` explicitly, and nothing about the response
 * to `-1` hints that they exist. Both halves, always.
 */
export const CHILE_BUSCA_AMOUNT_VISIBILITY = ["1", "0"] as const;

/** `idOrden` 3 = "Últimas publicadas". 1 = "Más relevantes primero", which is the site's default and is not a defined order for an importer. */
export const CHILE_BUSCA_ORDER_NEWEST_FIRST = "3";

export type ChileBuscaQuery = {
  /** One of CHILE_BUSCA_DATE_BUCKETS. Required — see there. */
  idTipoFecha: string;
  /** One of CHILE_BUSCA_AMOUNT_VISIBILITY. Required — see there. */
  esPublicoMontoEstimado: string;
  idEstado?: string;
  pagina?: number;
  idOrden?: string;
  textoBusqueda?: string;
  codigoRegion?: string;
  idTipoLicitacion?: string;
  /** `dd/mm/yyyy`. This pair filters on PUBLICATION date, not closing date. */
  fechaInicio?: string;
  fechaFin?: string;
};

/**
 * The payload, with every field `busqueda.js` sends — including the ones that
 * are always empty.
 *
 * They are sent because the server is an ASP.NET MVC action binding a model:
 * an absent field and an empty one are not reliably the same thing, and this
 * is not our endpoint to find out on. Copied from the shape in
 * `$.Busqueda.descargarArchivo`, field for field.
 */
export function chileBuscaPayload(query: ChileBuscaQuery): Record<string, string | number> {
  return {
    textoBusqueda: query.textoBusqueda ?? "",
    idEstado: query.idEstado ?? CHILE_BUSCA_ESTADOS.publicadas,
    codigoRegion: query.codigoRegion ?? "-1",
    idTipoLicitacion: query.idTipoLicitacion ?? "-1",
    fechaInicio: query.fechaInicio ?? "",
    fechaFin: query.fechaFin ?? "",
    // Ignored by both endpoints (measured), sent anyway for the reason above.
    registrosPorPagina: "10",
    idTipoFecha: query.idTipoFecha,
    idOrden: query.idOrden ?? CHILE_BUSCA_ORDER_NEWEST_FIRST,
    compradores: "",
    garantias: "",
    rubros: "",
    proveedores: "",
    montoEstimadoTipo: "-1",
    esPublicoMontoEstimado: query.esPublicoMontoEstimado,
    pagina: query.pagina ?? 1,
  };
}

export class ChileBuscaError extends Error {}

/** Our own container's egress gateway said no. Carries its own type so a caller can say "this machine cannot reach Chile" rather than "Chile is down". */
export class ChileBuscaEgressBlockedError extends ChileBuscaError {}

/** The server answered 200 and `{"estado":false}` — a refusal wearing a success code. */
export class ChileBuscaRefusedError extends ChileBuscaError {}

/**
 * A cookie jar.
 *
 * Not optional and not incidental: the CSV is generated into server-side
 * session state and handed back by GUID, and the load balancer pins the
 * session to one backend with its own cookie. A `Descargar` that does not
 * carry both gets HTTP 200 and zero bytes — which is why this exists as a
 * first-class object a caller has to hold, rather than a global that could
 * silently be empty.
 */
export class ChileBuscaSession {
  private readonly cookies = new Map<string, string>();
  private lastRequestAt = 0;

  private header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private absorb(response: Response): void {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }

  /** Strictly serial, with a deliberate gap. Someone else's front end pays for every one of these. */
  private async pace(): Promise<void> {
    const wait = this.lastRequestAt + CHILE_BUSCA_REQUEST_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }

  async request(path: string, init: RequestInit): Promise<{ response: Response; body: Buffer }> {
    const url = CHILE_BUSCA_BASE + path;
    // `cache: "no-store"` because Next patches global fetch: a held response —
    // a refusal included — replayed as this call's answer is the shape of bug
    // that makes a fix look like it did not work.
    const build = (): RequestInit => ({
      ...init,
      cache: "no-store",
      headers: { ...CHILE_BUSCA_HEADERS, ...(init.headers ?? {}), ...(this.cookies.size ? { Cookie: this.header() } : {}) },
    });

    await this.pace();
    let response = await fetch(url, build());
    for (let attempt = 1; attempt < MAX_ATTEMPTS && RETRYABLE_STATUSES.has(response.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      await this.pace();
      response = await fetch(url, build());
    }
    this.absorb(response);
    const body = Buffer.from(await response.arrayBuffer());

    // FIRST, before the status means anything.
    const denial = egressDenial(response.headers, body.toString("utf8").slice(0, 4000));
    if (denial) {
      throw new ChileBuscaEgressBlockedError(`抓取智利搜索页失败：${describeEgressDenial(denial)}\n  URL：${url}`);
    }
    if (!response.ok) {
      const snippet = body.toString("utf8").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
      throw new ChileBuscaError(
        `抓取智利搜索页失败：${response.status} ${response.statusText}${snippet ? ` —— 服务端返回：${snippet}` : "（空正文）"}\n  URL：${url}`,
      );
    }
    return { response, body };
  }
}

/**
 * Loads the search landing page once, purely to collect cookies.
 *
 * Without this the very first GenerarArchivo still answers 200 with a real
 * FileGuid — and the Descargar that follows it returns 200 and nothing. That
 * failure is completely silent, which is the only reason this is a required
 * step rather than a nicety.
 */
export async function warmSession(session: ChileBuscaSession = new ChileBuscaSession()): Promise<ChileBuscaSession> {
  await session.request("", { method: "GET" });
  return session;
}

export type ChileBuscaExportPage = {
  /** The CSV exactly as served, BOM already stripped. */
  csv: string;
  /** What the server named it — `ListaLicitaciones.csv` every time it was asked. */
  fileName: string;
  fileGuid: string;
};

/**
 * One page of the export: GenerarArchivo, then Descargar.
 *
 * `pagina` DOES work here, which is the finding that makes this door usable.
 * The UI hard-codes `pagina = 1` and says "Se descargán los primeros 1.000
 * resultados", so the 1,000 cap looks like a server limit. It is not — it is
 * the page size. Measured 2026-09-24: `pagina: 2` returned 47 further rows
 * with zero overlap against page 1, and `pagina: 3` returned the header alone.
 * 1000 + 47 = 1047, which is exactly the `hdnTotalPresupuestoPublico` the HTML
 * carries. The whole corpus is reachable; it just is not reachable the way the
 * button does it.
 */
export async function fetchChileBuscaExportPage(
  session: ChileBuscaSession,
  query: ChileBuscaQuery,
): Promise<ChileBuscaExportPage> {
  const payload = chileBuscaPayload(query);
  const { body } = await session.request("/Home/GenerarArchivo", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = body.toString("utf8");
  let meta: { FileGuid?: unknown; nombreArchivo?: unknown; estado?: unknown };
  try {
    meta = JSON.parse(text);
  } catch {
    throw new ChileBuscaError(
      `智利导出（GenerarArchivo）：HTTP 200，但正文不是 JSON（前 200 字：${text.replace(/\s+/g, " ").slice(0, 200)}）\n` +
        `  请求参数：${JSON.stringify(payload)}`,
    );
  }
  assertGenerated(meta, payload);

  const fileGuid = String(meta.FileGuid);
  const fileName = String(meta.nombreArchivo);
  const download = await session.request(
    `/Home/Descargar?fileGuid=${encodeURIComponent(fileGuid)}&nombreArchivo=${encodeURIComponent(fileName)}`,
    { method: "GET" },
  );
  const csv = assertCsvBody(download.body, fileGuid, fileName);
  return { csv, fileName, fileGuid };
}

/**
 * Refuses `{"estado": false}`, which arrives at HTTP 200.
 *
 * Exported and separate from the fetch so it can be tested against the
 * captured refusal without a network call — the whole point of pinning a trap
 * is that it only shows up when the source is being difficult.
 */
export function assertGenerated(
  meta: { FileGuid?: unknown; nombreArchivo?: unknown; estado?: unknown },
  payload?: Record<string, string | number>,
): void {
  if (meta.estado === true && typeof meta.FileGuid === "string" && meta.FileGuid.length > 0) return;
  throw new ChileBuscaRefusedError(
    `智利导出（GenerarArchivo）被拒绝：estado=${JSON.stringify(meta.estado)}，FileGuid=${JSON.stringify(meta.FileGuid)}。\n` +
      "  注意这条拒绝是用 HTTP 200 发的，按状态码判断会当成成功。\n" +
      "  实测最常见的原因是 idTipoFecha：留空或写成「1,2,3」都会得到这个应答，它必须是 1 / 2 / 3 中的一个。\n" +
      (payload ? `  请求参数：${JSON.stringify(payload)}\n` : ""),
  );
}

/**
 * Refuses the empty download, which also arrives at HTTP 200.
 *
 * A `Descargar` whose session cookies are missing, or whose GUID has expired,
 * returns `content-length: 0`. Zero bytes parses as zero rows and reports as a
 * clean import — the exact collapse this repo's house rule is about, so the
 * empty body is an error here and never an empty result set.
 *
 * The header check is deliberately on the column NAMES rather than on "is
 * there a `;` in it": a login page or an error page could contain semicolons,
 * and `IDLicitacion;NombreLicitacion` could not.
 */
export function assertCsvBody(body: Buffer, fileGuid: string, fileName: string): string {
  const csv = body.toString("utf8").replace(/^﻿/, "");
  if (body.length === 0) {
    throw new ChileBuscaError(
      `智利导出（Descargar）：HTTP 200，但正文是 0 字节。\n` +
        "  这不是「没有结果」—— 没有结果的应答是一行表头（约 134 字节）。\n" +
        "  实测原因：生成的文件存在服务端会话里，这个请求没带上 GenerarArchivo 那一步拿到的 cookie（或 GUID 已过期）。\n" +
        `  fileGuid=${fileGuid} nombreArchivo=${fileName}`,
    );
  }
  if (!csv.startsWith("IDLicitacion;")) {
    throw new ChileBuscaError(
      `智利导出（Descargar）：HTTP 200，${body.length} 字节，但开头不是 CSV 表头。\n` +
        `  前 200 字：${csv.replace(/\s+/g, " ").slice(0, 200)}\n` +
        `  fileGuid=${fileGuid} nombreArchivo=${fileName}`,
    );
  }
  return csv;
}

/**
 * Every open tender the search knows about, as raw CSV pages.
 *
 * Walks the full cross product of closing-date bucket × amount visibility,
 * because neither dimension has a working "all" value — see
 * CHILE_BUSCA_DATE_BUCKETS and CHILE_BUSCA_AMOUNT_VISIBILITY. Measured
 * 2026-09-24 that cross product is 15 requests and 4,055 distinct tenders,
 * with every one of the six groups disjoint from the others (0 duplicates).
 *
 * Paging stops on the first page that carries no data rows. That is safe in a
 * way it would not be for the OCDS index: here a short page IS the end, and
 * there is no `total` to walk to — the HTML's `hdnTotalPresupuesto*` hidden
 * inputs give one, but they drifted (1047 → 1041) inside twenty minutes of
 * measuring, because this is a live feed and tenders close while you read it.
 */
export async function fetchChileBuscaOpenTenders(
  session: ChileBuscaSession,
  options: { maxRows?: number; maxPagesPerGroup?: number } = {},
  onProgress?: (message: string) => void,
): Promise<{ pages: { query: ChileBuscaQuery; csv: string }[] }> {
  const maxPages = options.maxPagesPerGroup && options.maxPagesPerGroup > 0 ? options.maxPagesPerGroup : 10;
  const pages: { query: ChileBuscaQuery; csv: string }[] = [];
  let rowsSoFar = 0;

  for (const idTipoFecha of CHILE_BUSCA_DATE_BUCKETS) {
    for (const esPublicoMontoEstimado of CHILE_BUSCA_AMOUNT_VISIBILITY) {
      for (let pagina = 1; pagina <= maxPages; pagina++) {
        const query: ChileBuscaQuery = { idTipoFecha, esPublicoMontoEstimado, pagina };
        const page = await fetchChileBuscaExportPage(session, query);
        // Counted off the CRLF line count rather than a parse: this function
        // does no parsing, so that the parser stays pure and testable.
        const rows = page.csv.split("\r\n").filter((line) => line.length > 0).length - 1;
        onProgress?.(
          `关闭月份=${idTipoFecha} 金额公开=${esPublicoMontoEstimado} 第 ${pagina} 页：${rows} 行（${page.csv.length} 字节）`,
        );
        if (rows <= 0) break;
        pages.push({ query, csv: page.csv });
        rowsSoFar += rows;
        if (options.maxRows && options.maxRows > 0 && rowsSoFar >= options.maxRows) return { pages };
        if (rows < CHILE_BUSCA_EXPORT_PAGE_SIZE) break;
      }
    }
  }
  return { pages };
}

/**
 * One page of the HTML result fragment — the fallback path, and the ONLY
 * source for the closing date.
 *
 * This is what `busqueda.js` drops into `$('#searchResults').html(data)`. It
 * is not JSON and never was; it is a rendered fragment with no wrapper.
 *
 * It costs 10 rows per request against the export's 1,000, so covering the
 * corpus this way is ~406 requests instead of 15. It is used deliberately and
 * in bounded amounts — see ingest-chile.ts, which enriches only the rows it is
 * actually going to keep.
 */
export async function fetchChileBuscaSearchHtml(
  session: ChileBuscaSession,
  query: ChileBuscaQuery,
): Promise<string> {
  const { body } = await session.request("Home/Buscar", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(chileBuscaPayload(query)),
  });
  const html = body.toString("utf8");
  if (!html.includes("lic-bloq-wrap") && !html.includes("cabecera-resultados")) {
    throw new ChileBuscaError(
      `智利搜索页（Home/Buscar）：HTTP 200，${body.length} 字节，但里面既没有结果卡片也没有结果头。\n` +
        `  前 300 字：${html.replace(/\s+/g, " ").slice(0, 300)}`,
    );
  }
  return html;
}

/**
 * The public ficha, for a Chinese user to open.
 *
 * Identical to the OCDS mapper's, and deliberately so — the search page's own
 * `verFicha(...)` links use exactly this `?idlicitacion=` form (120 of 120
 * cards measured), which independently confirms round 2's finding. The
 * `?qs=<plain code>` form that returns 200 and a 121KB EMPTY page is the trap
 * documented in chile-ocds-mapper.ts; nothing here constructs it.
 *
 * Emitted as https. The site's own links say http and then redirect.
 */
export function chileBuscaPublicUrl(code: string): string {
  return `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(code)}`;
}
