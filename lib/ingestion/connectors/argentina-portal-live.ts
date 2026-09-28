/**
 * COMPR.AR and CONTRAT.AR — Argentina's national e-procurement portals, run by
 * the Oficina Nacional de Contrataciones. COMPR.AR carries goods and services
 * for the national administration; CONTRAT.AR carries public works, public
 * works concessions (Ley 17.520) and, since Decreto 416/25, privatizations.
 * One ASP.NET WebForms product under two hosts, so one connector.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * There is no API. The public list "Licitaciones de apertura próxima" — every
 * published process whose opening is still ahead (COMPR.AR 453 rows,
 * CONTRAT.AR 3, 2026-09-27) — is a GridView, ten rows a page, and every link
 * on it is a WebForms postback:
 *
 *   page N+1   POST the page's own hidden fields with
 *              __EVENTTARGET=<grid>, __EVENTARGUMENT=Page$N+1  → 200, page N+1
 *   one row    POST with __EVENTTARGET=<row link>              → 302 to
 *              /PLIEGO/VistaPreviaPliegoCiudadano.aspx?qs=…
 *
 * That redirect target is the process's own public page. It opens with no
 * session and no login (checked 2026-09-27 on both hosts), so it is the row's
 * official link. The postbacks are the ones the page itself makes when a
 * visitor clicks; nothing here is a door the site does not show.
 *
 * Pages are walked in order because ASP.NET event validation only accepts a
 * Page$N argument the current page rendered, and the pager always renders the
 * next one (as a number or as "…").
 *
 * A session has to be opened on the portal's home page first: CONTRAT.AR
 * answers a list request from a fresh session with "Object moved" to
 * /Default.aspx, and COMPR.AR sends a fresh visitor through a cookie check
 * (?AspxAutoDetectCookieSupport=1).
 *
 * ── What the process page has, and what it does not ──────────────────────
 *
 * Number, name, object, procedure, stage, scope (Nacional / Internacional),
 * currency, legal basis, the schedule (publication, questions, opening), the
 * contract duration, and the annexes. NOT the estimated amount: COMPR.AR's
 * public page never shows one and CONTRAT.AR's shows a currency with no
 * figure. The rows are unpriced by nature — lib/relevance.ts treats Argentina
 * as it treats Mexico (UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL).
 *
 * The annexes download with no login too, but only through a postback on the
 * process page, so there is no URL to store for them; the process page is the
 * link a reader follows to them.
 */
import { foldAccents } from "@/lib/text-fold";
import { runPool } from "@/lib/ingestion/run-pool";

export type ArgentinaPortalId = "comprar" | "contratar";

export type ArgentinaPortal = {
  id: ArgentinaPortalId;
  origin: string;
  /** Opens the session. */
  homePath: string;
  listPath: string;
  /** The GridView's UniqueID — the __EVENTTARGET of its pager. */
  gridUniqueId: string;
};

export const ARGENTINA_PORTALS: Record<ArgentinaPortalId, ArgentinaPortal> = {
  comprar: {
    id: "comprar",
    origin: "https://comprar.gob.ar",
    homePath: "/",
    listPath: "/Compras.aspx?qs=W1HXHGHtH10=",
    gridUniqueId: "ctl00$CPH1$GridListaPliegosAperturaProxima",
  },
  contratar: {
    id: "contratar",
    origin: "https://contratar.gob.ar",
    homePath: "/",
    listPath: "/ListarAperturaProxima.aspx",
    gridUniqueId: "ctl00$CPH1$GridListaPliegos",
  },
};

const HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;
const RETRIES = 3;
const RETRY_PAUSE_MS = 3_000;
/** Pages of ten; 453 rows on 2026-09-27. A bound, not an expectation. */
const MAX_PAGES = 120;
/** How long the list walk may take before it stops and reports how far it got. */
const DEFAULT_BUDGET_MS = 20 * 60_000;

// ── HTML helpers ─────────────────────────────────────────────────────────

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;?/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Every `<input type="hidden">` with a name, whatever the attribute order. */
export function hiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    if (!/type="hidden"/i.test(tag)) continue;
    const name = /\bname="([^"]*)"/i.exec(tag)?.[1];
    if (!name) continue;
    fields[decodeEntities(name)] = decodeEntities(/\bvalue="([^"]*)"/i.exec(tag)?.[1] ?? "");
  }
  return fields;
}

export function formAction(html: string, pageUrl: string): string {
  const action = /<form\b[^>]*\baction="([^"]*)"/i.exec(html)?.[1];
  return new URL(decodeEntities(action ?? ""), pageUrl).toString();
}

// ── The list ─────────────────────────────────────────────────────────────

export type ArgentinaPortalListRow = {
  /** "84/77-0606-LPU26", "504/2-0004-LPU26". */
  processNumber: string;
  name: string;
  /** "Licitación Pública", "Licitación Privada", "Contratación Directa", … */
  procedureType: string;
  /** "28/09/2026 07:00 Hrs." as shown. */
  openingText: string;
  state: string;
  /** "84/99 - Hospital Militar Regional Mendoza". */
  unit: string;
  /** COMPR.AR only: "374 - Estado Mayor General del Ejercito". */
  saf?: string;
  /** The row link's postback target. */
  eventTarget: string;
};

export function parsePortalGrid(html: string): ArgentinaPortalListRow[] {
  const rows: ArgentinaPortalListRow[] = [];
  for (const tr of html.split(/<tr\b[^>]*>/i).slice(1)) {
    const link = /__doPostBack\(&#39;([^&]+?lnkNumeroProceso)&#39;[^>]*>\s*([^<]+?)\s*<\/a>/i.exec(tr);
    if (!link) continue;
    const cells = tr
      .split(/<\/tr>/i)[0]
      .split(/<td\b[^>]*>/i)
      .slice(1)
      .map((cell) => cellText(cell.split(/<\/td>/i)[0]));
    if (cells.length < 6) continue;
    rows.push({
      processNumber: decodeEntities(link[2]).trim(),
      name: cells[1],
      procedureType: cells[2],
      openingText: cells[3],
      state: cells[4],
      unit: cells[5],
      ...(cells[6] ? { saf: cells[6] } : {}),
      eventTarget: decodeEntities(link[1]),
    });
  }
  return rows;
}

/** The pager argument for the page after the current one, or null on the last page. */
export function nextPageArgument(html: string, gridUniqueId: string): string | null {
  const pager = html.split(/class="pagination-gv/i)[1];
  if (!pager) return null;
  const current = Number(/<span>(\d+)<\/span>/.exec(pager)?.[1]);
  if (!Number.isFinite(current) || current < 1) return null;
  const wanted = `Page$${current + 1}`;
  const escapedGrid = gridUniqueId.replace(/\$/g, "\\$");
  return new RegExp(`__doPostBack\\(&#39;${escapedGrid}&#39;,&#39;Page\\$${current + 1}&#39;\\)`).test(pager) ? wanted : null;
}

// ── The process page ─────────────────────────────────────────────────────

export type ArgentinaPortalProcess = {
  processNumber: string;
  expediente?: string;
  name: string;
  object?: string;
  procedure?: string;
  stage?: string;
  modality?: string;
  /** "Nacional" | "Internacional". */
  scope?: string;
  currency?: string;
  legalBasis?: string;
  /** "84/77 - Departamento Contaduría y Finanzas (EMGE)". */
  unit?: string;
  /** "dd/mm/yyyy hh:mm" strings as shown. */
  publishedText?: string;
  questionsCloseText?: string;
  /** The (first) opening — bids close then. */
  openingText?: string;
  durationText?: string;
  /** Line items: "CONCESION RED FEDERAL CAMINOS; TRAMO: CENTRO". */
  items: string[];
  annexes: { name: string; type?: string; description?: string }[];
};

/** `<span id="…_lblX">value</span>` inside the process view, by suffix. */
function spans(html: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of html.matchAll(/<span id="ctl00_CPH1_(?:UCVistaPreviaPliego_)?(\w*?)_?(lbl\w+)">([\s\S]*?)<\/span>/g)) {
    const key = `${match[1]}.${match[2]}`;
    const value = cellText(match[3]);
    if (!value) continue;
    found.set(key, [...(found.get(key) ?? []), value]);
  }
  return found;
}

export function parsePortalProcess(html: string): ArgentinaPortalProcess | null {
  const all = spans(html);
  const one = (container: string, label: string): string | undefined => all.get(`${container}.${label}`)?.[0];
  const byLabel = (label: string): string[] =>
    [...all.entries()].filter(([key]) => key.endsWith(`.${label}`)).flatMap(([, values]) => values);

  const processNumber = one("UC_InformacionBasica", "lblNumeroProceso") ?? one("usrCabeceraPliego", "lblNumPliego");
  const name = one("UC_InformacionBasica", "lblNombreProceso") ?? one("usrCabeceraPliego", "lblNomPliego");
  if (!processNumber || !name) return null;

  // A single-stage process has lblFechaActoApertura; a multi-stage one a
  // repeater of openings, the first of which is when bids are submitted.
  const openingText =
    one("UC_Cronograma", "lblFechaActoApertura") ??
    [...all.entries()].find(([key]) => key.startsWith("UC_Cronograma_rptSiguienteApertura_ctl00.") && key.endsWith(".lblFechaHoraApertura"))?.[1][0];

  const annexNames = byLabel("lblNombreAnnexo");
  const annexTypes = byLabel("lblTipoAnexo");
  const annexDescriptions = [...all.entries()]
    .filter(([key]) => key.startsWith("UCAnexos_gvAnexos_") && key.endsWith(".lblDescripcion"))
    .flatMap(([, values]) => values);

  return {
    processNumber,
    ...(one("usrCabeceraPliego", "lblNumExpediente") ? { expediente: one("usrCabeceraPliego", "lblNumExpediente")!.replace(/\s+/g, " ") } : {}),
    name,
    ...(one("UC_InformacionBasica", "lblObjetoContratacion") ? { object: one("UC_InformacionBasica", "lblObjetoContratacion") } : {}),
    ...(one("UC_InformacionBasica", "lblProcedimientoSeleccion") ? { procedure: one("UC_InformacionBasica", "lblProcedimientoSeleccion") } : {}),
    ...(one("UC_InformacionBasica", "lblEtapa") ? { stage: one("UC_InformacionBasica", "lblEtapa") } : {}),
    ...(one("UC_InformacionBasica", "lblModalidad") ? { modality: one("UC_InformacionBasica", "lblModalidad") } : {}),
    ...(one("UC_InformacionBasica", "lblAlcance") ? { scope: one("UC_InformacionBasica", "lblAlcance") } : {}),
    ...(one("UC_InformacionBasica", "lblMoneda") ? { currency: one("UC_InformacionBasica", "lblMoneda") } : {}),
    ...(one("UC_InformacionBasica", "lblEncuadreLegal") ? { legalBasis: one("UC_InformacionBasica", "lblEncuadreLegal") } : {}),
    ...(one("usrCabeceraPliego", "lblUnidadOperativa") ? { unit: one("usrCabeceraPliego", "lblUnidadOperativa") } : {}),
    ...(one("UC_Cronograma", "lblFechaPublicacion") ? { publishedText: one("UC_Cronograma", "lblFechaPublicacion") } : {}),
    ...(one("UC_Cronograma", "lblFechaFinalConsultas") ? { questionsCloseText: one("UC_Cronograma", "lblFechaFinalConsultas") } : {}),
    ...(openingText ? { openingText } : {}),
    ...(one("UC_MontoDuracion", "lblMontoDuracionDuracionContrato") ? { durationText: one("UC_MontoDuracion", "lblMontoDuracionDuracionContrato") } : {}),
    items: [...all.entries()]
      .filter(([key]) => key.startsWith("UC_DetalleProductos_gvLineaPliego_") && key.endsWith(".lblDescripcion"))
      .flatMap(([, values]) => values),
    annexes: annexNames.map((annexName, index) => ({
      name: annexName,
      ...(annexTypes[index] ? { type: annexTypes[index].replace(/_/g, " ") } : {}),
      ...(annexDescriptions[index] ? { description: annexDescriptions[index] } : {}),
    })),
  };
}

// ── The session ──────────────────────────────────────────────────────────

/** Cookies and manual redirects — WebForms needs both and fetch keeps neither. */
export class PortalSession {
  private cookies = new Map<string, string>();

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private remember(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      if (at > 0) this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  }

  /**
   * One request, retried on 502/503/504 and on a dropped connection. Both
   * hosts answered 503 to a request that succeeded unchanged seconds later
   * (2026-09-27), so a transient refusal is retried rather than recorded as
   * a failed row. A postback here only reads a page, so repeating one is safe.
   */
  async request(url: string, init: { method?: "GET" | "POST"; form?: Record<string, string> } = {}): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.requestOnce(url, init);
        if (![502, 503, 504].includes(response.status) || attempt >= RETRIES) return response;
        await response.body?.cancel();
      } catch (err) {
        if (attempt >= RETRIES) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS * attempt));
    }
  }

  private async requestOnce(url: string, init: { method?: "GET" | "POST"; form?: Record<string, string> }): Promise<Response> {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        ...HEADERS,
        ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
        ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    this.remember(response);
    return response;
  }

  /** GET, following redirects by hand so every hop's cookies are kept. */
  async page(url: string): Promise<{ url: string; html: string }> {
    let current = url;
    for (let hop = 0; hop < 6; hop += 1) {
      const response = await this.request(current);
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) throw new Error(`${current} 返回 HTTP ${response.status}`);
      return { url: current, html: await response.text() };
    }
    throw new Error(`${url} 重定向次数过多`);
  }

  /** A postback; returns the redirect target if the server answered with one, else the new page. */
  async postBack(
    page: { url: string; html: string },
    eventTarget: string,
    eventArgument = "",
  ): Promise<{ redirect: string } | { url: string; html: string }> {
    const action = formAction(page.html, page.url);
    const form = { ...hiddenFields(page.html), __EVENTTARGET: eventTarget, __EVENTARGUMENT: eventArgument };
    const response = await this.request(action, { method: "POST", form });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      return { redirect: new URL(location, action).toString() };
    }
    if (!response.ok) throw new Error(`${action} 回发返回 HTTP ${response.status}`);
    return { url: action, html: await response.text() };
  }
}

// ── The walk ─────────────────────────────────────────────────────────────

export type ArgentinaPortalRecord = {
  portal: ArgentinaPortalId;
  row: ArgentinaPortalListRow;
  /** The process's own public page. */
  url: string;
  process: ArgentinaPortalProcess;
};

export type ArgentinaPortalFetchResult = {
  portal: ArgentinaPortalId;
  listed: ArgentinaPortalListRow[];
  records: ArgentinaPortalRecord[];
  /** Rows whose page could not be opened or read — reported, never silently dropped. */
  failed: { processNumber: string; error: string }[];
  /** Set when the walk hit its time budget before the last page. */
  stoppedEarly?: string;
};

/**
 * Every row of "apertura próxima"; the process page is opened only for the
 * rows `wanted` accepts, since each is a postback plus a ~250 KB page and most
 * of COMPR.AR's list is small by the procedure alone (a Licitación Privada or
 * Contratación Directa is capped by law well under the floor).
 */
export async function fetchArgentinaPortal(
  portalId: ArgentinaPortalId,
  options: { wanted: (row: ArgentinaPortalListRow) => boolean; maxPages?: number; pauseMs?: number; budgetMs?: number },
): Promise<ArgentinaPortalFetchResult> {
  const portal = ARGENTINA_PORTALS[portalId];
  const session = new PortalSession();
  const pause = () => new Promise((resolve) => setTimeout(resolve, options.pauseMs ?? 150));
  // COMPR.AR took 15 minutes on one run and over 40 on the next (2026-09-28,
  // slow answers and 503 retries). The walk stops at the budget and says so,
  // rather than holding the daily job past its 40-minute limit.
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);

  await session.page(`${portal.origin}${portal.homePath}`);
  let page = await session.page(`${portal.origin}${portal.listPath}`);

  const listed: ArgentinaPortalListRow[] = [];
  const failed: ArgentinaPortalFetchResult["failed"] = [];
  const opened: { row: ArgentinaPortalListRow; url: string }[] = [];
  const seen = new Set<string>();
  let stoppedEarly: string | undefined;

  // The walk: pages and row postbacks, in order on one session, since each
  // postback is only valid against the page it was rendered on.
  for (let pageNumber = 1; pageNumber <= (options.maxPages ?? MAX_PAGES); pageNumber += 1) {
    const rows = parsePortalGrid(page.html);
    if (pageNumber === 1 && rows.length === 0 && !/Se han encontrado \(0\)/.test(page.html)) {
      throw new Error(`${portal.origin} 的「apertura próxima」列表一行都没解析出来 —— 页面结构可能变了`);
    }
    for (const row of rows) {
      if (seen.has(row.processNumber)) continue;
      seen.add(row.processNumber);
      listed.push(row);
      if (!options.wanted(row)) continue;
      try {
        const answer = await session.postBack(page, row.eventTarget);
        if (!("redirect" in answer)) throw new Error("点开项目没有跳转到项目页");
        opened.push({ row, url: answer.redirect });
      } catch (err) {
        failed.push({ processNumber: row.processNumber, error: err instanceof Error ? err.message : String(err) });
      }
      await pause();
    }
    const next = nextPageArgument(page.html, portal.gridUniqueId);
    if (!next) break;
    if (Date.now() > deadline) {
      stoppedEarly = `读到第 ${pageNumber} 页时超过时间上限，后面的页没有读`;
      break;
    }
    const answer = await session.postBack(page, portal.gridUniqueId, next);
    if ("redirect" in answer) throw new Error(`翻到 ${next} 时被重定向到 ${answer.redirect}`);
    page = answer;
    await pause();
  }

  // The process pages: independent of the list session, so four at a time.
  // A fresh session each: with the list session's cookies the page answered
  // 503 on both hosts (2026-09-27), with none it answers 200 — which is also
  // how a reader following the link will open it.
  const records: ArgentinaPortalRecord[] = [];
  await runPool(opened, 4, async ({ row, url }) => {
    try {
      const detail = await new PortalSession().page(url);
      const process = parsePortalProcess(detail.html);
      if (!process) throw new Error("项目页读不出编号和名称");
      // Stored without the cookie-check suffix: the page opens without it.
      records.push({ portal: portalId, row, url: url.replace(/[&?]AspxAutoDetectCookieSupport=1$/, ""), process });
    } catch (err) {
      failed.push({ processNumber: row.processNumber, error: err instanceof Error ? err.message : String(err) });
    }
  });
  return { portal: portalId, listed, records, failed, ...(stoppedEarly ? { stoppedEarly } : {}) };
}

/** "Licitación Pública" / "Licitacion Pública" / "Concurso Público" — the open-call procedures. */
export function isOpenCallProcedure(procedureType: string): boolean {
  return /^(licitacion|concurso) public[ao]\b/i.test(foldAccents(procedureType).toLowerCase().replace(/\s+/g, " "));
}
