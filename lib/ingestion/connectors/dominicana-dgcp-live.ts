/**
 * Dominican Republic — the DGCP's open-data API (datosabiertos.dgcp.gob.do),
 * added 2026-10-04 (user: 先接多米尼加和厄瓜多尔 ← OK).
 *
 * The Dirección General de Contrataciones Públicas publishes every procedure
 * on the Portal Transaccional (comunidad.comprasdominicana.gob.do) and serves
 * the same records as JSON, no key, no login:
 *
 *   GET /api-dgcp/v1/procesos?startdate=YYYY-MM-DD&enddate=YYYY-MM-DD&page=N&limit=1000
 *   GET /api-dgcp/v1/procesos/documentos?proceso=<codigo_proceso>
 *
 * The spec is at /api-dgcp/docs/doc.json. Each process carries its procedure
 * (modalidad), the buyer, the estimated amount and currency, every date of
 * the schedule and the public notice URL; the documents call returns the
 * pliego, annexes and addenda as direct download links.
 *
 * Volume (September 2026, measured): 7,122 procedures, of which 4,783 were
 * below-threshold purchases and 1,737 minor contracts. The public tenders —
 * Licitación Pública Nacional / Internacional / Abreviada — were 104, and
 * those are the only ones read further (DOMINICANA_INGESTED_MODALIDADES).
 *
 * The API answers a client with no User-Agent (Python's default) 403, and
 * curl 200, so the header below is not optional.
 */

export const DGCP_API = "https://datosabiertos.dgcp.gob.do/api-dgcp/v1";

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;
const TIMEOUT_MS = 120_000;
const RETRIES = 3;

export type DgcpProceso = {
  codigo_proceso: string;
  codigo_unidad_compra?: number;
  unidad_compra: string;
  modalidad: string;
  tipo_excepcion?: string;
  titulo: string;
  descripcion?: string;
  estado_proceso: string;
  divisa?: string;
  monto_estimado?: number | null;
  fecha_publicacion: string;
  fecha_enmienda?: string;
  fecha_fin_recepcion_ofertas?: string;
  fecha_apertura_ofertas?: string;
  fecha_estimada_adjudicacion?: string;
  url?: string;
  objeto_proceso?: string;
  subobjeto_proceso?: string;
  organismo_financiero_externo?: string;
  compra_verde?: string;
  proceso_lotificado?: string;
  es_snip?: string;
  codigo_snip?: string;
};

export type DgcpDocumento = {
  nombre_documento: string;
  codigo_proceso: string;
  tipo_documento?: string;
  fecha_carga_archivo?: string;
  url_documento: string;
};

/** The open tenders. Everything else — below-threshold, minor, exception, price comparison, reverse auction — is a small or non-competitive buy. */
export const DOMINICANA_INGESTED_MODALIDADES = /^licitaci[oó]n p[uú]blica (nacional|internacional|abreviada)\b/i;

async function getJson<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return (await response.json()) as T;
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
    }
  }
  throw new Error(`${url} 请求失败：${last instanceof Error ? last.message : String(last)}`);
}

type Envelope<T> = { code?: number; hasError?: boolean; payload?: { content?: T[] } };

/** Every procedure published between the two dates (inclusive), all modalities. */
export async function fetchDgcpProcesos(startDate: string, endDate: string, fetchImpl?: typeof fetch): Promise<DgcpProceso[]> {
  const rows: DgcpProceso[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${DGCP_API}/procesos?startdate=${startDate}&enddate=${endDate}&page=${page}&limit=${PAGE_SIZE}`;
    const body = await getJson<Envelope<DgcpProceso>>(url, fetchImpl);
    if (body.hasError) throw new Error(`DGCP 接口返回错误（${url}）`);
    const content = body.payload?.content ?? [];
    rows.push(...content);
    if (content.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchDgcpDocumentos(codigoProceso: string, fetchImpl?: typeof fetch): Promise<DgcpDocumento[]> {
  const body = await getJson<Envelope<DgcpDocumento>>(`${DGCP_API}/procesos/documentos?proceso=${encodeURIComponent(codigoProceso)}`, fetchImpl);
  return body.payload?.content ?? [];
}
