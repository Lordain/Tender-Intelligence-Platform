/**
 * Boletín Oficial de la República Argentina, Tercera Sección (Contrataciones).
 *
 * Every national call for bids is announced here, and — the reason this is a
 * source at all — so are the state companies and the provinces that buy
 * outside COMPR.AR and CONTRAT.AR: Nucleoeléctrica Argentina, Entidad
 * Binacional Yacyretá, Administración General de Puertos, EANA, Operadora
 * Ferroviaria, Belgrano Cargas, and provincial units running IDB/World Bank
 * loans (Neuquén's UPEFE). 1,909 notices in the 30 weekdays to 2026-09-25,
 * about 66 a day.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 *   /seccion/tercera/YYYYMMDD        the edition: notices grouped under a
 *                                    category heading ("OBRAS - VIALES"),
 *                                    each an organism, a procedure and a link
 *   /detalleAviso/tercera/ID/DATE    one notice: organism (h1), procedure
 *                                    (h2) and the notice text
 *
 * Plain server-rendered HTML; the notice URL is permanent and is the row's
 * official link. A notice runs for one to three days, so the same call is in
 * consecutive editions under a new ID each day — rows are identified by
 * organism + procedure, not by the notice ID.
 */

export const BOLETIN_ORIGIN = "https://www.boletinoficial.gob.ar";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

export type BoletinListing = {
  /** YYYYMMDD of the edition it was listed in. */
  edition: string;
  /** "OBRAS - VIALES", "SUMINISTROS - EFECTOS VARIOS", "ADJUDICACIONES - ADJUDICACIONES", … */
  category: string;
  organism: string;
  /** "Licitación Pública 11-2026" — may be empty. */
  procedure: string;
  /** Absolute notice URL. */
  url: string;
  noticeId: string;
};

export type BoletinNotice = BoletinListing & {
  /** The notice body, whitespace collapsed. */
  text: string;
  /** "dd/mm/yyyy" from "Fecha de publicación". */
  publishedDate: string | null;
};

function decode(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;?/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function text(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseBoletinEdition(html: string, edition: string): BoletinListing[] {
  const listings: BoletinListing[] = [];
  let category = "";
  const pattern =
    /<h5 class="seccion-rubro[^"]*">([\s\S]*?)<\/h5>|<a href="(\/detalleAviso\/tercera\/(\d+)\/\d+)"[^>]*>\s*<div class="linea-aviso">\s*<p class="item">([\s\S]*?)<\/p>(?:\s*<p class="item-detalle">\s*<small>([\s\S]*?)<\/small>)?/g;
  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) {
      category = text(match[1]);
      continue;
    }
    listings.push({
      edition,
      category,
      organism: text(match[4]),
      procedure: text(match[5] ?? ""),
      url: `${BOLETIN_ORIGIN}${match[2]}`,
      noticeId: match[3],
    });
  }
  return listings;
}

export function parseBoletinNotice(html: string, listing: BoletinListing): BoletinNotice {
  const body = /<div id="cuerpoDetalleAviso"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
  const organism = text(/<div id="tituloDetalleAviso"[^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "") || listing.organism;
  const procedure = text(/<div id="tituloDetalleAviso"[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "") || listing.procedure;
  return {
    ...listing,
    organism,
    procedure,
    text: text(body.replace(/<style[\s\S]*?<\/style>/g, " ")),
    publishedDate: /Fecha de publicaci[oó]n\s*(\d{2}\/\d{2}\/\d{4})/.exec(text(html))?.[1] ?? null,
  };
}

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return await response.text();
      if (![502, 503, 504].includes(response.status) || attempt >= 3) throw new Error(`${url} 返回 HTTP ${response.status}`);
    } catch (err) {
      if (attempt >= 3) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * The last `editions` editions that carry notices, newest first, looking back
 * at most two weeks (holidays and weekends have none — 2026-08-17 was empty).
 */
export async function fetchBoletinEditions(options: { editions: number; now?: Date }): Promise<BoletinListing[]> {
  const listings: BoletinListing[] = [];
  let found = 0;
  const day = new Date(options.now ?? new Date());
  // Buenos Aires is UTC-3 with no DST; the edition is dated by its local day.
  day.setUTCHours(day.getUTCHours() - 3);
  for (let back = 0; back < 14 && found < options.editions; back += 1) {
    const edition = yyyymmdd(day);
    day.setUTCDate(day.getUTCDate() - 1);
    const weekday = new Date(`${edition.slice(0, 4)}-${edition.slice(4, 6)}-${edition.slice(6)}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const page = parseBoletinEdition(await get(`${BOLETIN_ORIGIN}/seccion/tercera/${edition}`), edition);
    if (page.length === 0) continue;
    listings.push(...page);
    found += 1;
  }
  return listings;
}

export async function fetchBoletinNotice(listing: BoletinListing): Promise<BoletinNotice> {
  return parseBoletinNotice(await get(listing.url), listing);
}
