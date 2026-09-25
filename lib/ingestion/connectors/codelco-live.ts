/**
 * Codelco's public calls — "Licitaciones en proceso" on codelco.com.
 *
 * ── Why here ─────────────────────────────────────────────────────────────
 *
 * Chile's state companies are outside Ley 19.886, so Codelco publishes
 * nothing on Mercado Público: the full busca export of 2026-09-25 (3,951 open
 * tenders) held no Codelco, ENAP or ENAMI row. Almost all of Codelco's buying
 * is by invitation on SAP Ariba. The exception is this page: a server-rendered
 * table of OPEN calls, most of them corporate category contracts ("Casa
 * Matriz") — chemicals, cables, pumps, steel, pipe — for every division at once.
 *
 * ── What the table does and does not say ─────────────────────────────────
 *
 * Seven columns: publication date, Bienes/Servicios, subject (linked to the
 * "llamado público" PDF), division, where the bases are (always Ariba), the
 * price of the bases, and a free-text "Fecha de entrega" — which is the
 * deadline to REGISTER INTEREST, by Ariba or e-mail, after which the bases go
 * to registered bidders only. That deadline is written five different ways
 * ("16 de Julio de 2026", "27-11-2025", "09.01.2025", "19/08/2024", and "28 de
 * marzo." with no year), or not at all ("hasta la recepción de ofertas").
 *
 * The table is not pruned: on 2026-09-25 it held 51 rows back to 2011, and
 * the newest had closed for interest on 16 July. codelcoCallIsOpen() decides
 * what is still actionable.
 */

const CODELCO_ORIGIN = "https://www.codelco.com";
export const CODELCO_LIST_URL = `${CODELCO_ORIGIN}/licitaciones-en-proceso`;

const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "es-CL,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;

export type CodelcoCall = {
  /** YYYY-MM-DD */
  publishedOn: string;
  kind: "Bienes" | "Servicios";
  subject: string;
  /** "Casa Matriz", "Gabriela Mistral", "Andina", … — first line of the Operación cell. */
  operation: string;
  /** The llamado público PDF or detail page the subject links to, absolute. */
  link?: string;
  /** YYYY-MM-DD of the last date in the "Fecha de entrega" text, when it has one. */
  interestDeadline?: string;
  deliveryText: string;
};

const MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").trim();
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function isoDay(year: string, month: string, day: string): string | undefined {
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? undefined : value;
}

/**
 * The last date written in a delivery text, in any of the table's formats.
 * A "28 de marzo." with no year takes the publication year — the one case on
 * the page (a 13/03/2024 call) is read correctly that way.
 */
export function lastDateIn(text: string, publicationYear: string): string | undefined {
  const folded = fold(text);
  const found: { index: number; day: string }[] = [];
  for (const m of folded.matchAll(/(\d{1,2}) de ([a-z]+)(?:,? (?:de |del (?:ano )?)?(\d{4}))?/g)) {
    const month = MONTHS[m[2]];
    const day = month ? isoDay(m[3] ?? publicationYear, month, m[1]) : undefined;
    if (day) found.push({ index: m.index!, day });
  }
  for (const m of folded.matchAll(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})/g)) {
    const day = isoDay(m[3], m[2], m[1]);
    if (day) found.push({ index: m.index!, day });
  }
  return found.sort((a, b) => a.index - b.index).at(-1)?.day;
}

/** Exported so the committed fixture exercises the same code as the live read. */
export function parseCodelcoTable(html: string): CodelcoCall[] {
  const start = html.indexOf('id="table-licitaciones"');
  if (start < 0) throw new Error("Codelco 页面上找不到 table-licitaciones —— 页面结构可能变了");
  const table = html.slice(start, html.indexOf("</table>", start));
  const calls: CodelcoCall[] = [];
  for (const row of table.matchAll(/<tr class="tbody-tr[^"]*">([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 7) continue;
    const date = /(\d{2})\/(\d{2})\/(\d{4})/.exec(cellText(cells[0]));
    const publishedOn = date ? isoDay(date[3], date[2], date[1]) : undefined;
    const subject = cellText(cells[2]).replace(/\s+/g, " ");
    if (!publishedOn || !subject) continue;
    const href = /href="([^"]+)"/.exec(cells[2])?.[1];
    const deliveryText = cellText(cells[6]).replace(/\s+/g, " ");
    const interestDeadline = lastDateIn(deliveryText, publishedOn.slice(0, 4));
    calls.push({
      publishedOn,
      kind: /servicio/i.test(cellText(cells[1])) ? "Servicios" : "Bienes",
      subject,
      operation: cellText(cells[3]).split("\n").map((line) => line.trim()).find(Boolean) ?? "",
      ...(href ? { link: new URL(decodeEntities(href), CODELCO_ORIGIN).toString() } : {}),
      ...(interestDeadline ? { interestDeadline } : {}),
      deliveryText,
    });
  }
  return calls;
}

/** A call with no written date is treated as open for this long after publication. */
const UNDATED_OPEN_DAYS = 30;

/** Still actionable on `today` (YYYY-MM-DD, Santiago). */
export function codelcoCallIsOpen(call: CodelcoCall, today: string): boolean {
  if (call.interestDeadline) return call.interestDeadline >= today;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${call.publishedOn}T00:00:00Z`)) / 86_400_000;
  return age <= UNDATED_OPEN_DAYS;
}

export async function fetchCodelcoCalls(): Promise<CodelcoCall[]> {
  const response = await fetch(CODELCO_LIST_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Codelco 返回 HTTP ${response.status} ${response.statusText}`);
  return parseCodelcoTable(await response.text());
}
