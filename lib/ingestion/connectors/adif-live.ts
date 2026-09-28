/**
 * Trenes Argentinos Infraestructura (ADIF S.A.) — the state company that
 * builds and renews the national rail network: track renewal, signalling,
 * traction substations, turnouts and sleepers, Línea Roca, San Martín,
 * Sarmiento, Urquiza, Mitre. It buys outside COMPR.AR, on its own portal.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * https://plataforma.adifsa.com.ar/portal_licitaciones is one server-rendered
 * page (~20 MB) holding every procedure since 2014 as collapsible panels. The
 * page marks the ones still open itself — `class="panel panel-default
 * l-activa"`, the set its own "Sólo Activas" switch shows (14 on 2026-09-27)
 * — and only those are read.
 *
 * Each panel: the procedure and its number ("Licitación Pública Nacional
 * 39/2026"), Compra or Contratación, the object, "Fecha apertura de sobres",
 * and the attachments — notice, particular and general conditions, technical
 * specifications, circulars — as direct links under /uploads/, free and with
 * no login. There is no per-procedure page; the portal is the link, and the
 * attachments are stored as the row's documents.
 *
 * No amount on the panel. The notice PDF sometimes states one; it is not
 * read here.
 */

export const ADIF_PORTAL_URL = "https://plataforma.adifsa.com.ar/portal_licitaciones";
const ORIGIN = "https://plataforma.adifsa.com.ar";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

export type AdifTender = {
  /** "Licitación Pública Nacional", "Licitación Pública Nacional e Internacional", "Contratación Directa", … */
  procedureType: string;
  /** "39/2026". */
  number: string;
  /** "Compra" | "Contratación". */
  kind: string;
  description: string;
  /** "dd/mm/yyyy" — the envelope opening, when bids close. */
  openingDate: string | null;
  files: { url: string; fileName: string; category: string }[];
};

function decode(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;?/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function text(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseAdifActivePanels(html: string): AdifTender[] {
  const tenders: AdifTender[] = [];
  for (const panel of html.split(/(?=<div class="panel panel-default[^"]*">)/).filter((part) => part.startsWith('<div class="panel panel-default l-activa">'))) {
    const heading = /<span[^>]*class="tipo-licitacion"[^>]*>([\s\S]*?)<span[^>]*class="text-muted compra-contratacion"[^>]*>([\s\S]*?)<\/span>/.exec(panel);
    if (!heading) continue;
    const head = text(heading[1]);
    const numbered = /^(.*?)\s+(\d+\s*\/\s*\d{4})\s*$/.exec(head);
    const description = text(/<p style="margin-left: 15px[^"]*">([\s\S]*?)<\/p>/.exec(panel)?.[1] ?? "");
    const openingDate = /Fecha apertura de sobres:\s*(\d{2}\/\d{2}\/\d{4})/.exec(text(panel))?.[1] ?? null;
    const files: AdifTender["files"] = [];
    const seen = new Set<string>();
    for (const link of panel.matchAll(/<a target="_blank" class="text-muted"[^>]*href="(\/uploads\/[^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const path = decode(link[1]).replace(/\?v=[\d.]+$/, "");
      if (seen.has(path)) continue;
      seen.add(path);
      files.push({ url: new URL(path, ORIGIN).toString(), fileName: decode(link[2]), category: text(link[3]).split("|")[0].trim() });
    }
    tenders.push({
      procedureType: numbered ? numbered[1].trim() : head,
      number: numbered ? numbered[2].replace(/\s+/g, "") : "",
      kind: text(heading[2]),
      description,
      openingDate,
      files,
    });
  }
  return tenders;
}

export async function fetchAdifActiveTenders(): Promise<AdifTender[]> {
  const response = await fetch(ADIF_PORTAL_URL, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`ADIF 招标门户返回 HTTP ${response.status}`);
  const html = await response.text();
  const tenders = parseAdifActivePanels(html);
  if (tenders.length === 0 && /Portal de Licitaciones/.test(html) && !/l-activa/.test(html)) {
    // The page answered and simply has nothing open — possible, and not an error.
    return [];
  }
  if (tenders.length === 0) throw new Error("ADIF 招标门户一条在招项目都没解析出来 —— 页面结构可能变了");
  return tenders;
}
