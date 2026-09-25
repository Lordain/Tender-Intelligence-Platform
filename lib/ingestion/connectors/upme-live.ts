/**
 * Colombia's transmission-expansion calls — UPME's "Convocatorias de
 * transmisión" — read from the WordPress REST API behind upme.gov.co.
 *
 * ── What these are ───────────────────────────────────────────────────────
 *
 * The Unidad de Planeación Minero Energética selects an INVESTOR to design,
 * supply, build, operate and maintain each new piece of the national (STN,
 * 230/500 kV) or regional (STR, 110/115 kV) grid, who is then paid a regulated
 * annuity for decades. Colombia's equivalent of an ANEEL transmission auction,
 * and not on SECOP at all: none of the large Colombian power companies buy
 * competitively there (measured 2026-09-25, three months of SECOP II), and
 * these calls are UPME's own process.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * upme.gov.co is WordPress. Each call is a `convocatorias` post, and the
 * REST API serves them with no credential:
 *
 *   /wp-json/wp/v2/convocatorias?estado_convocatoria=283,287&per_page=100
 *
 * 283 is "Abierta oficialmente", 287 "Prepublicación" (taxonomy
 * `estado_convocatoria`, read from /wp-json/wp/v2/estado_convocatoria). The
 * body of each post is the call's page: the object, the official publication
 * date, and every document — DSI, annexes, addenda, and the minutes of each
 * hearing as it happens.
 *
 * ── The tag is not the stage ─────────────────────────────────────────────
 *
 * Of the 16 posts tagged open or pre-published on 2026-09-25, most were not
 * biddable: UPME 02-2025 and 04-2024 already carried their award minutes,
 * UPME 02-2026 the minutes of the proposal-opening hearing, UPME 10-2021 a
 * "declaratoria de proceso desierto", and the four pre-publications dated
 * from 2018–2019. The tag is set once and not maintained. The documents are,
 * because the minutes ARE the process — so upmeCallStage() reads the stage
 * from them, and a call is only imported while no investor-side hearing has
 * happened yet.
 */
const UPME_ORIGIN = "https://www.upme.gov.co";
const OPEN_ESTADOS = { official: 283, prepublication: 287 } as const;
const CALLS_URL = `${UPME_ORIGIN}/wp-json/wp/v2/convocatorias?estado_convocatoria=${OPEN_ESTADOS.official},${OPEN_ESTADOS.prepublication}&per_page=100&_fields=id,date,modified,link,title,content,estado_convocatoria,tipo_convocatoria`;

/** Taxonomy `tipo_convocatoria`: national (STN) or regional (STR) grid. */
const TIPO_STN = 351;

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "es-CO,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;

export type UpmePost = {
  id: number;
  date: string;
  modified: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  estado_convocatoria: number[];
  tipo_convocatoria: number[];
};

export type UpmeDocument = { url: string; label: string };

export type UpmeCall = {
  postId: number;
  /** "UPME 08-2026", "UPME STR 05-2026" — the number UPME itself uses. */
  number: string;
  title: string;
  /** The "Objeto" paragraph. */
  object: string;
  grid: "STN" | "STR";
  prepublication: boolean;
  /** YYYY-MM-DD of "PUBLICACIÓN OFICIAL" (or "PREPUBLICACIÓN" for a pre-published call). */
  publishedOn?: string;
  stage: UpmeStage;
  link: string;
  documents: UpmeDocument[];
};

/**
 * Where the investor selection stands, read from the minutes on the page.
 *
 * "open" means no investor-side hearing has been held yet. The interventor
 * (the supervising engineer) is selected in a separate, earlier track —
 * "Acta de recepción ofertas Interventoría", "Evaluación interventoría" — and
 * says nothing about whether investors can still bid, so those are ignored.
 */
export type UpmeStage = "open" | "proposals_received" | "awarded" | "void";

const MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

/** WordPress escapes the dash in "Resolución 541 – 2026" as &#8211; and the ampersand in its own URLs as &#038;. */
function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function visibleText(html: string): string {
  const withoutCode = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  return decodeHtmlEntities(withoutCode.replace(/<[^>]+>/g, " | ")).replace(/(\s*\|\s*)+/g, " | ").replace(/\s+/g, " ").trim();
}

/** "10 de Julio de 2026" → "2026-07-10". */
function spanishDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = /(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(fold(raw));
  if (!match) return undefined;
  const month = MONTHS[match[2]];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : undefined;
}

export function upmeCallStage(text: string): UpmeStage {
  const folded = fold(text);
  if (/desiert[oa]|proceso cancelado/.test(folded)) return "void";
  if (/adjudicacion|resolucion de seleccion (?:del )?inversionista/.test(folded)) return "awarded";
  if (
    /evaluacion (?:de )?inversionista|contrapropuesta|audiencia de continuacion|presentacion (?:de )?(?:las )?(?:propuestas|ofertas)(?! (?:de )?(?:seleccion (?:de )?)?interventor)/.test(folded)
  ) {
    return "proposals_received";
  }
  return "open";
}

/** "Convocatoria UPME 02 2026 Nueva Subestación…" → "UPME 02-2026"; "UPME STR 05-2026 …" → "UPME STR 05-2026". */
export function upmeCallNumber(title: string): string | undefined {
  const match = /UPME\s+(STR\s+)?(\d{1,2})[\s-]+(\d{4})/i.exec(title);
  if (!match) return undefined;
  return `UPME ${match[1] ? "STR " : ""}${match[2].padStart(2, "0")}-${match[3]}`;
}

function documentsOf(html: string): UpmeDocument[] {
  const seen = new Set<string>();
  const documents: UpmeDocument[] = [];
  for (const match of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decodeHtmlEntities(match[1]).trim();
    if (!/^https?:\/\/docs\.upme\.gov\.co\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const label = visibleText(match[2]).replace(/^\|\s*|\s*\|$/g, "").trim();
    documents.push({ url, label: label || decodeURIComponent(url.split("/").pop() ?? "documento") });
  }
  return documents;
}

/** One post → a call. Exported so the committed fixture exercises the same code as the live read. */
export function parseUpmePost(post: UpmePost): UpmeCall | null {
  const title = decodeHtmlEntities(post.title.rendered).replace(/\s+/g, " ").trim();
  const number = upmeCallNumber(title);
  if (!number) return null;
  const text = visibleText(post.content.rendered);
  const object = /Objeto\s*\|\s*([^|]+)/i.exec(text)?.[1]?.trim() ?? title;
  const prepublication = post.estado_convocatoria.includes(OPEN_ESTADOS.prepublication) && !post.estado_convocatoria.includes(OPEN_ESTADOS.official);
  const officialDate = spanishDate(/PUBLICACI[ÓO]N OFICIAL:?\s*([^|.]+)/i.exec(text)?.[1]);
  const preDate = spanishDate(/PREPUBLICACI[ÓO]N:?\s*([^|.]+)/i.exec(text)?.[1]);
  return {
    postId: post.id,
    number,
    title: title.replace(/\s*[–-]\s*Prepublicaci[óo]n\s*$/i, "").replace(/^Convocatoria\s+/i, ""),
    object,
    grid: post.tipo_convocatoria.includes(TIPO_STN) ? "STN" : "STR",
    prepublication,
    ...((prepublication ? preDate : officialDate) ? { publishedOn: prepublication ? preDate : officialDate } : {}),
    stage: upmeCallStage(text),
    link: post.link,
    documents: documentsOf(post.content.rendered),
  };
}

export async function fetchUpmeCalls(): Promise<UpmePost[]> {
  const response = await fetch(CALLS_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`UPME 返回 HTTP ${response.status} ${response.statusText}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error("UPME 接口没有返回数组 —— 格式可能变了");
  return body as UpmePost[];
}
