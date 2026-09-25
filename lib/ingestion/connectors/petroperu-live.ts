/**
 * Petroperú's "Competencia internacional" list — the state oil company's
 * own procurement abroad, outside SEACE.
 *
 * ── What the list holds ──────────────────────────────────────────────────
 *
 * A server-rendered table, newest first, 20 rows a page: date, code and a
 * one-line description. Two kinds of code share it, and only one is a call:
 *
 *   PCI-NNNN-YYYY-XXX  Proceso por Competencia Internacional — a real call,
 *                      with Bases, consultas, cronograma changes. Two in the
 *                      twelve months to 2026-09-25.
 *   CAI-NNNN-YYYY-XXX  published AFTER the purchase: every one read on
 *                      2026-09-25 carried an "Informe técnico" plus an "Orden
 *                      de compra / de trabajo", or a "Memorando de
 *                      cancelación". Never mapped.
 *
 * The documents of a row are not in the page; the page's own script asks
 * /VF/ws.php for them (rt=exa&cmd=pvpDoc&id=N) and gets JSON with one link
 * per document. No session or token is needed for that request.
 *
 * The list does not state a bid deadline — it is in the Bases and moves with
 * each "Modificación cronograma" (the 2025 catalyst call had twenty).
 */

const PETROPERU_ORIGIN = "https://www.petroperu.com.pe";
export const PETROPERU_LIST_URL = `${PETROPERU_ORIGIN}/proveedores/avisos-y-convocatorias/competencia-internacional/`;
const DOCUMENTS_URL = `${PETROPERU_ORIGIN}/VF/ws.php`;

const HEADERS = {
  "Accept-Language": "es-PE,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;

export type PetroperuRow = {
  /** The list's own row id, which the documents request takes. */
  id: string;
  /** YYYY-MM-DD */
  publishedOn: string;
  /** "PCI-0002-2025-OFP – segunda convocatoria", verbatim. */
  code: string;
  description: string;
};

export type PetroperuDocument = {
  /** Increases with upload order — the latest document says where the process is. */
  id: number;
  name: string;
  url: string;
  fileName: string;
  fileType: string;
};

export type PetroperuCall = PetroperuRow & { documents: PetroperuDocument[] };

const MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&([aeiouAEIOU])acute;/g, (_, vowel: string) => `${vowel}́`.normalize("NFC"))
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function fieldText(block: string, field: string): string | undefined {
  const match = new RegExp(`data-field="${field}">([\\s\\S]*?)</div>`).exec(block);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : undefined;
}

/** "07-Sep-2026" → "2026-09-07". */
export function parsePetroperuDate(raw: string): string | undefined {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  const month = match ? MONTHS[match[2].toLowerCase()] : undefined;
  return match && month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : undefined;
}

/** Exported so the committed fixture exercises the same code as the live read. */
export function parsePetroperuList(html: string): PetroperuRow[] {
  if (!html.includes("tbl_procesos_de_venta_publica")) throw new Error("Petroperú 页面上找不到招标列表 —— 页面结构可能变了");
  const rows: PetroperuRow[] = [];
  for (const match of html.matchAll(/<tr class="Data">([\s\S]*?)<\/tr>/g)) {
    const id = fieldText(match[1], "id");
    const publishedOn = parsePetroperuDate(fieldText(match[1], "date") ?? "");
    const code = fieldText(match[1], "title");
    const description = fieldText(match[1], "description");
    if (!id || !publishedOn || !code || !description) continue;
    rows.push({ id, publishedOn, code, description });
  }
  return rows;
}

type DocumentsResponse = {
  blnSuccess?: number | string;
  aRows?: Record<
    string,
    {
      idDocumento_del_proceso?: string;
      fld_1417_Nombre_del_documento?: string;
      fld_1418_Archivo?: string;
      fld_1418_Archivo_fileFile?: string;
      fld_1418_Archivo_fileType?: string;
    }
  >;
};

/** Exported for the fixture. */
export function parsePetroperuDocuments(response: DocumentsResponse): PetroperuDocument[] {
  if (Number(response.blnSuccess) !== 1) throw new Error("Petroperú 文件接口没有返回成功（blnSuccess ≠ 1）");
  const documents: PetroperuDocument[] = [];
  for (const row of Object.values(response.aRows ?? {})) {
    const href = /href="([^"]+)"/.exec(row.fld_1418_Archivo ?? "")?.[1];
    const id = Number(row.idDocumento_del_proceso);
    if (!href || !Number.isFinite(id)) continue;
    documents.push({
      id,
      name: (row.fld_1417_Nombre_del_documento ?? "").trim(),
      url: new URL(decodeEntities(href), PETROPERU_ORIGIN).toString(),
      fileName: (row.fld_1418_Archivo_fileFile ?? "").trim(),
      fileType: (row.fld_1418_Archivo_fileType ?? "").trim(),
    });
  }
  return documents.sort((a, b) => a.id - b.id);
}

/** Page 1 of the list: the 20 newest rows, enough for a window of days. */
export async function fetchPetroperuList(): Promise<PetroperuRow[]> {
  const response = await fetch(PETROPERU_LIST_URL, { headers: { ...HEADERS, Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Petroperú 返回 HTTP ${response.status} ${response.statusText}`);
  return parsePetroperuList(await response.text());
}

export async function fetchPetroperuDocuments(rowId: string): Promise<PetroperuDocument[]> {
  const response = await fetch(DOCUMENTS_URL, {
    method: "POST",
    headers: { ...HEADERS, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
    body: `rt=exa&cmd=pvpDoc&id=${encodeURIComponent(rowId)}`,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Petroperú 文件接口返回 HTTP ${response.status} ${response.statusText}`);
  return parsePetroperuDocuments((await response.json()) as DocumentsResponse);
}
