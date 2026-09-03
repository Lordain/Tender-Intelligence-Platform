// No "server-only" guard — same reasoning as compras-mx-connector.ts:
// imported directly by standalone scripts run via tsx outside Next.js.

/**
 * Fetches and parses ONE DOF notice's own detail page
 * (`dof.gob.mx/nota_detalle.php?codigo=<codNota>&fecha=<DD/MM/YYYY>`) —
 * the real content DOF's advanced-search endpoint (dof-search-mapper.ts)
 * never carries. Confirmed real 2026-09-03: the search endpoint's
 * `titulo` for a tender notice is often just "<BUYER> - REF:<number>"
 * with nothing else (see lib/relevance.ts's BARE_BUYER_REF_TITLE gate),
 * but the notice's OWN detail page has the real procedure number, title,
 * and a full key-dates table — the user found this by opening
 * `nota_detalle.php?codigo=5797664&fecha=01/09/2026` by hand and seeing
 * real content (CFE-0001-CAAAT-0134-2026, "Adquisición de equipos y
 * materiales para la provisión del servicio de internet gratuito", a
 * 6-row schedule table) where the search index only had "COMISION FEDERAL
 * DE ELECTRICIDAD - REF:579874".
 *
 * Confirmed NOT anti-bot gated (2026-09-03): a plain unauthenticated
 * `curl` with no cookies/headers returned the real 46KB page — same
 * finding as the search endpoint itself (see README.md "CFE tenders
 * confirmed in DOF"), consistent with DOF being a public transparency
 * portal rather than a transactional system like Compras MX.
 *
 * Real HTML shape (from that one CFE example — NOT yet confirmed for
 * PEMEX or other buyers, which may format their convocatoria table
 * differently; parseDofNoticeDetailHtml() returns null rather than
 * fabricating a guess when the expected shape isn't found, so a
 * differently-shaped notice is a visible skip, not silent wrong data):
 * an anchor `<a name="table01">` precedes a `<table>` whose first two
 * rows are single `colspan="2"` cells (procedure number, then title), and
 * every row after that is a label/value pair — the label cell has
 * `bgcolor="#D9D9D9"`, the sibling `<td>` holds the value. Labels seen so
 * far: "Fecha de publicación en Micrositio:", "Sesión de Aclaraciones:",
 * "Límite para presentación de ofertas:", "Apertura Técnica:", "Apertura
 * Económica:", "Fallo" (no trailing colon on this last one — a real,
 * easy-to-miss inconsistency in DOF's own generated HTML).
 */

const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  iquest: "¿",
  iexcl: "¡",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(\w+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export type DofNoticeDetail = {
  procedureNumber?: string;
  title?: string;
  /** Raw label (trailing ":" stripped) -> raw value text, unparsed — real labels documented above, but intentionally not typed as a closed set since a different buyer's notice may use different ones. */
  fieldsByLabel: Record<string, string>;
};

/** Returns null (not a thrown error) when the expected table shape isn't found — a differently-formatted notice, not a parsing bug, per this file's header comment. */
export function parseDofNoticeDetailHtml(html: string): DofNoticeDetail | null {
  const tableMatch = html.match(/<a name="table01">[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;

  const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (rows.length === 0) return null;

  let procedureNumber: string | undefined;
  let title: string | undefined;
  const fieldsByLabel: Record<string, string> = {};

  for (const rowHtml of rows) {
    const cells = [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({ attrs: m[1], text: stripTags(m[2]) }));
    if (cells.length === 0) continue;

    if (cells.length === 1 || /colspan/i.test(cells[0].attrs)) {
      if (procedureNumber === undefined) procedureNumber = cells[0].text;
      else if (title === undefined) title = cells[0].text;
      continue;
    }

    if (cells.length >= 2 && /bgcolor/i.test(cells[0].attrs)) {
      const label = cells[0].text.replace(/:\s*$/, "").trim();
      if (label && cells[1].text) fieldsByLabel[label] = cells[1].text;
    }
  }

  if (!procedureNumber && !title && Object.keys(fieldsByLabel).length === 0) return null;
  return { procedureNumber, title, fieldsByLabel };
}

export type FetchDofNoticeDetailResult =
  | { status: "found"; detail: DofNoticeDetail }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** `fecha` must be DD/MM/YYYY, matching the real URL shape the user confirmed (not the search endpoint's YYYY/MM/DD). */
export async function fetchDofNoticeDetail(codNota: number, fecha: string): Promise<FetchDofNoticeDetailResult> {
  const url = `https://dof.gob.mx/nota_detalle.php?codigo=${codNota}&fecha=${encodeURIComponent(fecha)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) return { status: "error", message: `HTTP ${response.status} ${response.statusText}` };

  const html = await response.text();
  const detail = parseDofNoticeDetailHtml(html);
  return detail ? { status: "found", detail } : { status: "not_found" };
}
