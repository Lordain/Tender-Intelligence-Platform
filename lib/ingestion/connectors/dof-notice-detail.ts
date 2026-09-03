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
 * Real HTML shape: an anchor `<a name="table01">` precedes a `<table>`
 * whose leading `colspan="2"` row(s) hold the procedure number and title,
 * and every row after that is a label/value pair — the label cell has
 * `bgcolor="#D9D9D9"`, the sibling `<td>` holds the value.
 * parseDofNoticeDetailHtml() returns null rather than fabricating a guess
 * when no table01 is found at all, so a genuinely different notice shape
 * is a visible skip, not silent wrong data — but CFE alone is confirmed
 * to use at least TWO different leading-row shapes for the number/title,
 * both handled here (2026-09-03, two different CFE "Área Contratante"
 * offices, same overall table structure otherwise):
 * - CFE-0001-CAAAT-0134-2026: TWO separate colspan rows, number then
 *   title, nothing else on either.
 * - CFE-0040-CAAAT-0004-2026: ONE colspan row containing BOTH, as
 *   "<numero>: <título>" (title text continuing in a nested `<p>`) — this
 *   one silently lost its title entirely under the old two-row-only
 *   assumption (fell back to the search stub) until the real HTML was
 *   pulled and compared line-by-line against the two-row example.
 * Real date-field labels also vary between these two same offices, not
 * just the number/title shape — confirmed real: "Apertura Técnica"/
 * "Apertura Económica" (first office) vs "Apertura de ofertas técnicas."/
 * "Apertura de ofertas económicas." (second office, trailing period,
 * "de ofertas" inserted) — dof-search-mapper.ts's label patterns were
 * widened to match both after the second office's dates went missing
 * entirely under the narrower patterns.
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
      const cellText = cells[0].text;
      // Real gap (2026-09-03, CFE-0040-CAAAT-0004-2026): some notices put
      // BOTH the number and the title in this one leading row as
      // "<numero>: <título>", not two separate rows — assuming a second
      // colspan row would always follow lost the title entirely for
      // these (silently fell back to the search stub). A colon this
      // early can only be the number/title separator here — a real
      // procedure number never contains one.
      const combinedMatch = procedureNumber === undefined ? cellText.match(/^([^:]{1,40}):\s*(.+)$/) : null;
      if (combinedMatch) {
        procedureNumber = combinedMatch[1].trim();
        title = combinedMatch[2].trim();
      } else if (procedureNumber === undefined) {
        procedureNumber = cellText;
      } else if (title === undefined) {
        title = cellText;
      }
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
