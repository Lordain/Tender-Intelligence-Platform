/**
 * Chile's public-works concessions — "Proyectos en Licitación" on the MOP's
 * Dirección General de Concesiones site (concesiones.mop.gob.cl).
 *
 * ── Why here ─────────────────────────────────────────────────────────────
 *
 * A concession is tendered under the Ley de Concesiones (DS MOP 900), not
 * Ley 19.886, so none of these reach Mercado Público: the call is printed in
 * the Diario Oficial and the bases are sold by the DGC. They are the largest
 * single calls in Chile — on 2026-10-10 the page listed six, from the Ruta 5
 * Collipulli–Temuco motorway (UF 26.5M, about US$ 1.1bn) to a cable car and a
 * prison — and none of them was on the platform (2026-10-09 source review,
 * user: OK).
 *
 * ── What the pages say ───────────────────────────────────────────────────
 *
 * The list page is a WordPress accordion: category headings, each with links
 * to project pages. A project page carries a "Ficha" of label/value pairs —
 * Presupuesto oficial, Fecha de Llamado a Licitación, Fecha de Recepción de
 * Ofertas Técnicas y Económicas, Fecha de Apertura de Ofertas Económicas —
 * and a document table (llamado, bases, circulares aclaratorias). Dates are
 * Spanish prose ("17 de diciembre de 2026 (circular aclaratoria en
 * trámite)"); the budget is "UF 26.535.000", "MM USD 946,2 (UF 23.893.000)"
 * or "MM USD 113".
 *
 * The list is not pruned when bids close: on 2026-10-10 two of the six had
 * received their offers months before (Ruta 57 in August, the tsunami
 * warning system in January). The mapper reads the bid date, and the
 * platform's own past-deadline rule does the rest.
 */

const ORIGIN = "https://concesiones.mop.gob.cl";
export const CHILE_CONCESIONES_LIST_URL = `${ORIGIN}/concesiones/proyectos-en-licitacion/`;

const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "es-CL,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; public-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;

export type ConcesionListing = {
  /** Accordion heading: "Ruta Panamericana de Chile y sus accesos", "Infraestructura Penitenciaria", … */
  category: string;
  name: string;
  url: string;
};

export type ConcesionDocument = { name: string; url: string; month?: string; year?: string };

export type ConcesionProject = ConcesionListing & {
  description?: string;
  /** "Pública" or "Privada" — who proposed the project, not who may bid. */
  initiative?: string;
  region?: string;
  comuna?: string;
  volume?: string;
  /** The budget cell as written. */
  budgetText?: string;
  /** YYYY-MM-DD */
  calledOn?: string;
  /** YYYY-MM-DD — technical and economic offers are received together. */
  offersDue?: string;
  /** YYYY-MM-DD */
  economicOpening?: string;
  /** Whatever follows a date in brackets, e.g. "circular aclaratoria en trámite". */
  dateNotes: string[];
  documents: ConcesionDocument[];
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
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The page as lines of text, one per block element. */
function lines(html: string): string[] {
  const body = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:br|\/p|\/li|\/h\d|\/div|\/td|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** "17 de diciembre de 2026 (circular …)" → "2026-12-17"; undefined when there is no full date. */
export function spanishDate(text: string): string | undefined {
  const m = /(\d{1,2}) de ([a-z]+) (?:de |del )?(\d{4})/.exec(fold(text));
  const month = m ? MONTHS[m[2]] : undefined;
  if (!m || !month) return undefined;
  const value = `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? undefined : value;
}

/** Exported so the committed fixture exercises the same code as the live read. */
export function parseConcesionesList(html: string): ConcesionListing[] {
  const listings: ConcesionListing[] = [];
  for (const section of html.matchAll(/<h5 class="et_pb_toggle_title">([\s\S]*?)<\/h5>\s*<div class="et_pb_toggle_content">([\s\S]*?)<\/div>/g)) {
    const category = decodeEntities(section[1].replace(/<[^>]+>/g, "")).trim();
    for (const link of section[2].matchAll(/<a href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/g)) {
      const url = new URL(decodeEntities(link[1]), ORIGIN).toString();
      if (!/\/project\//.test(url)) continue;
      listings.push({ category, name: decodeEntities(link[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(), url });
    }
  }
  return listings;
}

/** The value printed after a Ficha label, read from the page's lines. */
function fichaValue(pageLines: string[], label: RegExp): string | undefined {
  const at = pageLines.findIndex((line) => label.test(fold(line)));
  if (at < 0) return undefined;
  const sameLine = pageLines[at].replace(/^[^:]*:\s*/, "").trim();
  if (sameLine) return sameLine;
  const next = pageLines[at + 1];
  // An empty value ("Volumen:" with nothing after it) is followed directly by the next label.
  return next && !/:\s*$/.test(next) ? next : undefined;
}

function bracketNote(text: string | undefined): string | undefined {
  return text ? /\(([^)]+)\)/.exec(text)?.[1]?.trim() : undefined;
}

export function parseConcesionProject(html: string, listing: ConcesionListing): ConcesionProject {
  const pageLines = lines(html.slice(Math.max(0, html.indexOf('id="et-main-area"')), html.indexOf("<footer") > 0 ? html.indexOf("<footer") : undefined));
  // "Descripción", sometimes a "Detalle(s)" sub-heading, then paragraphs up
  // to the document table's header ("Tipo") or the Ficha.
  const description: string[] = [];
  const descriptionAt = pageLines.findIndex((line) => /^descripcion$/.test(fold(line)));
  if (descriptionAt >= 0) {
    for (const line of pageLines.slice(descriptionAt + 1)) {
      if (/^(tipo|ficha|ficha tecnica\b.*|documentacion del contrato)$/.test(fold(line))) break;
      if (/^detalles?$/.test(fold(line))) continue;
      description.push(line);
    }
  }

  const offersText = fichaValue(pageLines, /^fecha de recepcion de ofertas/);
  const openingText = fichaValue(pageLines, /^fecha de apertura de ofertas economicas/);
  const calledText = fichaValue(pageLines, /^fecha de llamado a licitacion/);
  const dateNotes = [...new Set([bracketNote(offersText), bracketNote(openingText)].filter((note): note is string => Boolean(note)))];

  const documents: ConcesionDocument[] = [];
  for (const block of html.split('<div class="document-manager-file">').slice(1)) {
    const link = /<div class="document-manager-file-name"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!link) continue;
    const month = /<div class="document-manager-file-month">([^<]*)<\/div>/.exec(block)?.[1]?.trim();
    const year = /<div class="document-manager-file-year">([^<]*)<\/div>/.exec(block)?.[1]?.trim();
    documents.push({
      name: decodeEntities(link[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
      url: new URL(decodeEntities(link[1]), ORIGIN).toString(),
      ...(month ? { month } : {}),
      ...(year ? { year } : {}),
    });
  }

  return {
    ...listing,
    ...(description.length > 0 ? { description: description.join(" ") } : {}),
    initiative: fichaValue(pageLines, /^tipo de iniciativa/),
    region: fichaValue(pageLines, /^region:/),
    comuna: fichaValue(pageLines, /^comuna:/),
    volume: fichaValue(pageLines, /^volumen:/),
    budgetText: fichaValue(pageLines, /^presupuesto oficial/),
    calledOn: calledText ? spanishDate(calledText) : undefined,
    offersDue: offersText ? spanishDate(offersText) : undefined,
    economicOpening: openingText ? spanishDate(openingText) : undefined,
    dateNotes,
    documents,
  };
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`特许经营总局（DGC）返回 HTTP ${response.status} ${response.statusText}：${url}`);
  return response.text();
}

/** The list and every project page on it, one after another (six pages on 2026-10-10). */
export async function fetchConcesionProjects(): Promise<ConcesionProject[]> {
  const listings = parseConcesionesList(await fetchPage(CHILE_CONCESIONES_LIST_URL));
  const projects: ConcesionProject[] = [];
  for (const listing of listings) projects.push(parseConcesionProject(await fetchPage(listing.url), listing));
  return projects;
}
