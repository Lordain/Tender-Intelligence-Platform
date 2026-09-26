/**
 * Metro de Santiago's "Próximas Licitaciones" — the buyer's own programme of
 * tenders it plans to open (2026-09-26, user: 智利圣地亚哥地铁「即将招标」
 * 自动导入，需要备注是预告即将招标).
 *
 * ── Why this page and not Metro's tenders themselves ─────────────────────
 *
 * Metro S.A. is a state company outside Ley 19.886, so nothing it buys is on
 * Mercado Público. Its open tenders sit on its own portal behind an Altcha
 * proof-of-work challenge and supplier registration — a gate, and this
 * platform does not get around gates. This page is the part it publishes to
 * anyone: a plain server-rendered table of Proyecto / Servicio / Publicación
 * (a month, "jun-26"), which names the line-building work months before the
 * bases exist — station civil works for L7, tunnels and track for L9,
 * rolling stock and CBTC signalling. A reader acts on it by registering with
 * Metro ahead of time, which is what the tender page tells them to do.
 *
 * ── What the table does not say ──────────────────────────────────────────
 *
 * No amounts, no deadlines, no ids. The month is the buyer's estimate
 * ("Las fechas son referenciales"), and the table is not pruned: on
 * 2026-09-26 it held 107 rows back to mar-22, most of them long since
 * tendered. The mapper decides what is still ahead.
 */

const METRO_ORIGIN = "https://www.metro.cl";
export const METRO_SANTIAGO_PREVIEW_URL = `${METRO_ORIGIN}/licitaciones/proximas-licitaciones`;

const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "es-CL,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;

export type MetroSantiagoPlannedTender = {
  /** The Proyecto cell as written: "L9", "Línea 7", "L6EX EFE", "Operacionales", … */
  project: string;
  /** The Servicio cell: what will be tendered. */
  service: string;
  /** The Publicación cell as written, e.g. "jun-26". */
  plannedText: string;
  /** YYYY-MM parsed from plannedText, when it parses. */
  plannedMonth?: string;
};

const MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+)acute;/gi, (_, letter: string) => `${letter}́`.normalize("NFC"))
    .replace(/&ntilde;/gi, (match) => (match[1] === "N" ? "Ñ" : "ñ"));
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** "jun-26" / "sept-2026" / "Junio 2026" → "2026-06"; undefined when it does not parse. */
export function parsePlannedMonth(text: string): string | undefined {
  const match = /([a-záéíóú]{3,})\.?\s*[-/ ]\s*(\d{2}|\d{4})\b/i.exec(text.trim());
  if (!match) return undefined;
  const month = MONTHS[match[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3)];
  if (!month) return undefined;
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${year}-${month}`;
}

/** Every data row of the table; the header row ("Proyecto / Servicio / Publicación") is skipped. */
export function parseMetroSantiagoPreviewPage(html: string): MetroSantiagoPlannedTender[] {
  const rows: MetroSantiagoPlannedTender[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(cellText);
    if (cells.length < 3) continue;
    const [project, service, plannedText] = cells;
    if (!service || /^servicio$/i.test(service) || /^proyecto$/i.test(project)) continue;
    rows.push({ project, service, plannedText, plannedMonth: parsePlannedMonth(plannedText) });
  }
  return rows;
}

export async function fetchMetroSantiagoPreview(): Promise<MetroSantiagoPlannedTender[]> {
  const response = await fetch(METRO_SANTIAGO_PREVIEW_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Metro de Santiago próximas licitaciones answered HTTP ${response.status}`);
  return parseMetroSantiagoPreviewPage(await response.text());
}
