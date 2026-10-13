/**
 * Panama — PanamaCompra V3, the Dirección General de Contrataciones Públicas'
 * procurement system. Added 2026-10-06 as a read-only trial (user: 好的，请开始,
 * after 第 1 步：开发分支试运行，只出报告，不写数据库).
 *
 * The public site (www.panamacompra.gob.pa/Inicio/#/busqueda-avanzada) is an
 * Angular app; the two calls it makes for an anonymous visitor are what this
 * reads, no key, no login:
 *
 *   POST https://apisv3.panamacompra.gob.pa/busqueda/proceso-lista-publico
 *        {registrosPorPagina, valorSiguiente, filtro:{idTipoProceso, fechaDesde, fechaHasta, …}}
 *   GET  https://apisv3.panamacompra.gob.pa/procesos-configuracion/pagina-componentes-publico/{idTipoProceso}/procesoVistaPliego/{idProcesosContratacionFlujos}
 *
 * The list pages by cursor: each answer's `valorInicial` is the next request's
 * `valorSiguiente`, empty when there is no more. The date filter is on the
 * date of the latest status change, not on publication, so a window picks up
 * every procedure that moved in it — a tender published in August and
 * awarded yesterday included — and the same procedure can appear on two pages;
 * callers dedupe by numProceso.
 *
 * The detail is the public 「Pliego de cargos」 page as components: dates,
 * reference price, description, documents, conditions. It also names the
 * buyer's contact person with a phone and an e-mail; that is personal data
 * and nothing here reads it.
 *
 * What did NOT work, so nobody retries it: the official OCDS API
 * (ocds.panamacompraencifras.gob.pa) answers but stopped at April 2024; the
 * old ASMX search (/Security/AmbientePublico.asmx/ListarActosParametros)
 * answers 500 to every payload; and over HTTP/2 through the sandbox's proxy
 * apisv3 answered 201 with an empty body (curl --http1.1 got the data; Node's
 * fetch speaks HTTP/1.1 already).
 */

export const PANAMACOMPRA_API = "https://apisv3.panamacompra.gob.pa";
export const PANAMACOMPRA_SITE = "https://www.panamacompra.gob.pa";

const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json;charset=utf-8",
  Referer: `${PANAMACOMPRA_SITE}/`,
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; public-data ingestion)",
} as const;

const PAGE_SIZE = 50;
const MAX_PAGES = 80;
const TIMEOUT_MS = 60_000;
const RETRIES = 3;
/** Between detail requests: one visitor's pace, not a crawl. */
const DETAIL_PAUSE_MS = 400;

/**
 * The formal tenders, by idTipoProceso (GET /procesos-tipo/publico, read
 * 2026-10-06). Left out: online quotations (2, 23), minor purchases (4, 6, 8,
 * 9), exceptional and special procedures (3, 5, 14, 15 — direct or restricted
 * awards), shortage purchases (24) and the sale of state property (26).
 */
export const PANAMA_TENDER_TYPES: Readonly<Record<number, string>> = {
  7: "Licitación pública",
  10: "Licitación pública Ley 419",
  11: "Licitación por mejor valor Ley 419",
  12: "Licitación por precio único",
  16: "Licitación por mejor valor",
  17: "Licitación de subasta en reversa Ley 419",
  18: "Banco Mundial",
  19: "Banco Interamericano de Desarrollo",
  20: "Programa de las Naciones Unidas",
  21: "Banco Europeo de Inversiones",
  22: "Banco Centroamericano de Integración Económica",
};

export type PanamaProceso = {
  idProcesosContratacion: number;
  idProcesosContratacionFlujos: number;
  numProceso: string;
  titulo: string;
  /** Procedure type name, e.g. "Licitacion pública". */
  nombre: string;
  idTipoProceso: number;
  /** Status name: Vigente, Por adjudicar, Adjudicado, Desierto, Cancelado, Suspendido, En reclamo… */
  nombreRealizado: string;
  idEstado: number;
  nombreObjectoContractual?: string;
  nombreModalidad?: string;
  nombreEntidad: string;
  nombreUnidadCompra?: string;
  nombreDependencia?: string;
  /** UTC. The time of the latest status change, despite the name. */
  fechaPublicacion?: string;
  fechaEstado?: string;
};

/** The detail page's label → value pairs, first occurrence of each label. Contact person fields are dropped. */
export type PanamaDetalle = {
  fields: Record<string, string>;
  /** Proposal documents the bidder must submit (the 「documentos de la propuesta」 list). */
  documentosPropuesta: string[];
  /** Files attached to the procedure: pliego, addenda, minutes. */
  archivos: { tipoArchivo: string; uuid: string }[];
};

async function requestJson<T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (!text) throw new Error("空响应");
      return JSON.parse(text) as T;
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
    }
  }
  throw new Error(`${url} 请求失败：${last instanceof Error ? last.message : String(last)}`);
}

type Envelope<T> = { status?: number; result?: T; message?: unknown };
type ListResult = { registros?: PanamaProceso[]; valorInicial?: string | null };

/** Every procedure of one type whose status changed between the two instants (ISO, UTC). */
export async function fetchPanamaProcesos(
  idTipoProceso: number,
  fromIso: string,
  toIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: PanamaProceso[]; truncated: boolean }> {
  const rows: PanamaProceso[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = {
      registrosPorPagina: PAGE_SIZE,
      valorSiguiente: cursor,
      filtro: { idEstado: 0, idTipoProceso, fechaDesde: fromIso, fechaHasta: toIso, idProvincia: 0 },
    };
    const answer = await requestJson<Envelope<ListResult>>(
      `${PANAMACOMPRA_API}/busqueda/proceso-lista-publico`,
      { method: "POST", body: JSON.stringify(body) },
      fetchImpl,
    );
    if (answer.status !== 1) throw new Error(`PanamaCompra 列表返回错误：${JSON.stringify(answer.message ?? "status " + answer.status)}`);
    rows.push(...(answer.result?.registros ?? []));
    cursor = answer.result?.valorInicial ?? "";
    if (!cursor) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

type Component = { identificador?: string; tipo?: string; value?: unknown };

const CONTACT_COMPONENT = "componentInfoUsuario";

/** Flattens the public pliego page into the fields the mapper reads. */
export function parsePanamaDetalle(result: { pageComponentes?: Component[] }): PanamaDetalle {
  const fields: Record<string, string> = {};
  const documentosPropuesta: string[] = [];
  const archivos: PanamaDetalle["archivos"] = [];
  for (const component of result.pageComponentes ?? []) {
    if (component.tipo === CONTACT_COMPONENT) continue;
    const value = component.value;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        if (typeof entry.tipoArchivo === "string" && typeof entry.uuid === "string") {
          archivos.push({ tipoArchivo: entry.tipoArchivo, uuid: entry.uuid });
          continue;
        }
        const label = typeof entry.nombre === "string" ? entry.nombre.trim() : "";
        const raw = entry.value;
        if (label && (typeof raw === "string" || typeof raw === "number") && !(label in fields)) fields[label] = String(raw).trim();
      }
    } else if (value && typeof value === "object") {
      const docs = (value as { documentosPropuesta?: { texto?: string }[] }).documentosPropuesta ?? [];
      for (const doc of docs) if (doc.texto) documentosPropuesta.push(doc.texto.replace(/\s+/g, " ").trim());
    }
  }
  return { fields, documentosPropuesta, archivos };
}

/**
 * The page layout the detail is read with. Some procedure types have no
 * 「Pliego de cargos」 layout of its own and answer {"status":0,"result":
 * "ERROR"}: type 16 (Licitación por mejor valor, all 47 in the 2026-10-06
 * trial) and type 19 (BID, the same day). The same procedures read with the
 * Licitación pública layout (7) come back complete — the layout only decides
 * how the page is arranged; the data is the procedure's own. So a refusal is
 * retried once with layout 7.
 */
const FALLBACK_LAYOUT = 7;

async function readPliego(layout: number, flujo: number, fetchImpl: typeof fetch): Promise<Envelope<{ pageComponentes?: Component[] } | string>> {
  const url = `${PANAMACOMPRA_API}/procesos-configuracion/pagina-componentes-publico/${layout}/procesoVistaPliego/${flujo}`;
  return requestJson<Envelope<{ pageComponentes?: Component[] } | string>>(url, { method: "GET" }, fetchImpl);
}

export async function fetchPanamaDetalle(proceso: Pick<PanamaProceso, "idTipoProceso" | "idProcesosContratacionFlujos">, fetchImpl: typeof fetch = fetch): Promise<PanamaDetalle> {
  let layout = proceso.idTipoProceso;
  let answer = await readPliego(layout, proceso.idProcesosContratacionFlujos, fetchImpl);
  if (answer.status !== 1 && layout !== FALLBACK_LAYOUT) {
    layout = FALLBACK_LAYOUT;
    answer = await readPliego(layout, proceso.idProcesosContratacionFlujos, fetchImpl);
  }
  if (answer.status !== 1 || !answer.result || typeof answer.result !== "object") {
    throw new Error(`PanamaCompra 详情返回错误（类型 ${layout}，${proceso.idProcesosContratacionFlujos}）：${JSON.stringify(answer.message ?? answer.result ?? "")}`);
  }
  return parsePanamaDetalle(answer.result);
}

export function pausePanamaDetail(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DETAIL_PAUSE_MS));
}

/** One entry of a procedure's 「actas」 list (componentProcesosActasPliego): minutes, addenda, the award resolution. */
export type PanamaActa = {
  nombre: string;
  idTipoActas?: number;
  fechaRealizada?: string;
  paginaSiguiente?: string;
  rutaNueva?: string;
  paramsBody?: Record<string, unknown>;
};

/** Every record a procedure's public page lists, read from the same pliego page as the detail. */
export async function fetchPanamaActas(proceso: Pick<PanamaProceso, "idTipoProceso" | "idProcesosContratacionFlujos">, fetchImpl: typeof fetch = fetch): Promise<PanamaActa[]> {
  let layout = proceso.idTipoProceso;
  let answer = await readPliego(layout, proceso.idProcesosContratacionFlujos, fetchImpl);
  if (answer.status !== 1 && layout !== FALLBACK_LAYOUT) {
    layout = FALLBACK_LAYOUT;
    answer = await readPliego(layout, proceso.idProcesosContratacionFlujos, fetchImpl);
  }
  if (answer.status !== 1 || !answer.result || typeof answer.result !== "object") {
    throw new Error(`PanamaCompra 详情返回错误（类型 ${layout}，${proceso.idProcesosContratacionFlujos}）：${JSON.stringify(answer.message ?? answer.result ?? "")}`);
  }
  const actas: PanamaActa[] = [];
  for (const component of answer.result.pageComponentes ?? []) {
    if (component.tipo !== "componentProcesosActasPliego" || !Array.isArray(component.value)) continue;
    for (const entry of component.value as PanamaActa[]) if (entry && typeof entry.nombre === "string") actas.push(entry);
  }
  return actas;
}

/** The award resolution among a procedure's records — the latest, if a first one was annulled and reissued. */
export function findAdjudicacionActa(actas: PanamaActa[]): PanamaActa | undefined {
  return actas
    .filter((acta) => /resoluci[oó]n de adjudicaci[oó]n/i.test(acta.nombre) && acta.rutaNueva)
    .sort((a, b) => (b.fechaRealizada ?? "").localeCompare(a.fechaRealizada ?? ""))[0];
}

export type PanamaAdjudicacion = { suppliers: string[]; amount?: number; date?: string };

/**
 * The figures after "B/." in a clause, as numbers. Written both ways round —
 * 「B/.185,000.00」 and 「B/. 73.399,65」 — and now and then without the dot
 * (「B/64,000.00」), so a comma or dot followed by exactly two final digits
 * is the decimal mark and every other one groups thousands.
 */
export function balboaFigures(text: string): number[] {
  return [...text.matchAll(/B\/\.?\s?(\d[\d.,]*\d)/g)]
    .map((m) => {
      const raw = m[1];
      const decimal = /[.,](\d{2})$/.exec(raw);
      const whole = (decimal ? raw.slice(0, -3) : raw).replace(/[.,]/g, "");
      return Number(decimal ? `${whole}.${decimal[1]}` : whole);
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * The resolution page as an award: the winners (componentOfertasAdjudicadasProponentes),
 * the amount the resolution adjudicates, and its date.
 *
 * The amount is read from the RESUELVE clauses — 「Adjudicar el Acto Público
 * No. … al proponente BIO LAB INTERNACIONAL, S. A., por la suma de … (B/.185,000.00)」
 * — every B/. figure in a clause that adjudicates, summed, since a procedure
 * split into renglones adjudicates each to its winner in its own sentence.
 * Balboas are at par with the dollar, and the import stores Panama in USD.
 *
 * The winning offers' lines are the check, and the fallback: their totals
 * (the renegotiated one where there is one) add up to the resolution's
 * figure — RLJ's 71,989.65 + 1,410.00 = B/.73,399.65 — but resolutions are
 * typed by hand. Of the ten awarded 2026-10-07 to 13, one named no figure at
 * all and one wrote 「B/ 64,00.00」 for an offer of 64,000.00. So when the
 * clauses give nothing, or a figure more than half off the offers, the
 * offers' total is used.
 */
export function parsePanamaAdjudicacion(result: { pageComponentes?: Component[] }): PanamaAdjudicacion {
  const suppliers: string[] = [];
  const clauses: string[] = [];
  let offersTotal = 0;
  let date: string | undefined;
  for (const component of result.pageComponentes ?? []) {
    const value = component.value as unknown;
    if (component.tipo === "componentOfertasAdjudicadasProponentes" && Array.isArray(value)) {
      for (const oferta of value as { empresa?: { nombreComercial?: string }; procesosOfertasItems?: { precioTotal?: number | null; nuevoPrecioTotal?: number | null }[] }[]) {
        const name = oferta.empresa?.nombreComercial?.replace(/\s+/g, " ").trim();
        if (name && !suppliers.includes(name)) suppliers.push(name);
        for (const item of oferta.procesosOfertasItems ?? []) {
          const total = item.nuevoPrecioTotal ?? item.precioTotal;
          if (typeof total === "number" && Number.isFinite(total) && total > 0) offersTotal += total;
        }
      }
    }
    if (component.identificador === "resuelve" && typeof value === "string") clauses.push(value);
    if (component.identificador === "otrosResuelve" && Array.isArray(value)) {
      for (const entry of value as { texto?: string }[]) if (entry.texto) clauses.push(entry.texto);
    }
    if (component.tipo === "componentFooterActas" && value && typeof value === "object") {
      const day = /^(\d{2})-(\d{2})-(\d{4})/.exec(String((value as { fechaRealizada?: string }).fechaRealizada ?? ""));
      if (day) date = `${day[3]}-${day[2]}-${day[1]}`;
    }
  }
  const figures = clauses.filter((clause) => /\badjudic/i.test(clause)).flatMap(balboaFigures);
  const resolved = figures.length ? figures.reduce((sum, n) => sum + n, 0) : undefined;
  const offers = offersTotal > 0 ? offersTotal : undefined;
  const chosen = resolved !== undefined && (offers === undefined || Math.abs(resolved - offers) <= offers / 2) ? resolved : offers;
  const amount = chosen !== undefined ? Math.round(chosen * 100) / 100 : undefined;
  return { suppliers, ...(amount !== undefined ? { amount } : {}), ...(date ? { date } : {}) };
}

/** Opens a record the way the public site does: POST {rutaNueva}/get-page with the record's own parameters. */
export async function fetchPanamaAdjudicacion(idTipoProceso: number, acta: PanamaActa, fetchImpl: typeof fetch = fetch): Promise<PanamaAdjudicacion> {
  const answer = await requestJson<Envelope<{ pageComponentes?: Component[] } | string>>(
    `${PANAMACOMPRA_API}${acta.rutaNueva}/get-page`,
    { method: "POST", body: JSON.stringify({ ...(acta.paramsBody ?? {}), idTipoProceso }) },
    fetchImpl,
  );
  if (answer.status !== 1 || !answer.result || typeof answer.result !== "object") {
    throw new Error(`PanamaCompra 中标决议返回错误：${JSON.stringify(answer.message ?? answer.result ?? "")}`);
  }
  return parsePanamaAdjudicacion(answer.result);
}
