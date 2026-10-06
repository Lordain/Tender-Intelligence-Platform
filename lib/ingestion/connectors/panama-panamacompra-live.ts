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
 * The page layout the detail is read with, by procedure type. Type 16
 * (Licitación por mejor valor) has no 「Pliego de cargos」 layout of its own:
 * every one of the 47 type-16 procedures in the 2026-10-06 trial answered
 * {"status":0,"result":"ERROR"}, while the same procedures read with the
 * Licitación pública layout (7) came back complete. The layout only decides
 * how the page is arranged; the data is the procedure's own.
 */
const DETAIL_LAYOUT: Readonly<Record<number, number>> = { 16: 7 };

export async function fetchPanamaDetalle(proceso: Pick<PanamaProceso, "idTipoProceso" | "idProcesosContratacionFlujos">, fetchImpl: typeof fetch = fetch): Promise<PanamaDetalle> {
  const layout = DETAIL_LAYOUT[proceso.idTipoProceso] ?? proceso.idTipoProceso;
  const url = `${PANAMACOMPRA_API}/procesos-configuracion/pagina-componentes-publico/${layout}/procesoVistaPliego/${proceso.idProcesosContratacionFlujos}`;
  const answer = await requestJson<Envelope<{ pageComponentes?: Component[] } | string>>(url, { method: "GET" }, fetchImpl);
  if (answer.status !== 1 || !answer.result || typeof answer.result !== "object") {
    throw new Error(`PanamaCompra 详情返回错误（类型 ${layout}，${proceso.idProcesosContratacionFlujos}）：${JSON.stringify(answer.message ?? answer.result ?? "")}`);
  }
  return parsePanamaDetalle(answer.result);
}

export function pausePanamaDetail(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DETAIL_PAUSE_MS));
}
