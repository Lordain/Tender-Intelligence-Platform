import type { Tender } from "@/types/tender";

/**
 * How to find one tender's bid documents on the platform that holds them,
 * click by click.
 *
 * Most sources here publish a searchable listing but no per-tender URL a
 * stranger can link to — Compras MX keys its detail page on an internal GUID,
 * Pemex's DispForm.aspx needs a login, CFE's own endpoints are WAF-gated
 * behind a session-bound token, and SEACE's ficha is keyed by a UUID that
 * appears nowhere in the OCDS record. So "前往官方投标入口" lands the reader on
 * a search form, and until now the site left them there to work out which of
 * half a dozen fields takes a procedure number.
 *
 * Every step below is the user's own verified click-path (2026-09-11), field
 * names copied as those pages actually spell them — that is the point, since a
 * Chinese reader is matching Spanish labels on screen, not translating them.
 *
 * Returns null when the tender already has a real deep link (a resolved
 * Compras MX detail page, a ProInversión per-project page): steps for a page
 * the reader is already standing on are noise.
 */
export type TenderSearchGuide = {
  /** The platform that actually holds the documents — not necessarily where this tender's data came from. */
  platform: string;
  /**
   * The search page, when it is somewhere other than the tender's own 官方入口
   * link. null means that link already IS the search page, so the panel should
   * not repeat it.
   */
  url: string | null;
  steps: string[];
  note?: string;
};

type SearchGuideInput = Pick<Tender, "buyer" | "sourceName" | "sourceUrl">;

/** A Compras MX row whose LicitIA lookup resolved gets a real detail URL; an unresolved one falls back to the bare search page. */
const COMPRASMX_DETAIL_PATH = "/detalle/";

const PEMEX = /pemex|petr[oó]leos mexicanos/i;
const CFE = /comisi[oó]n federal de electricidad|\bcfe\b/i;
const SEACE = /\boece\b|\bseace\b/i;
const COMPRASMX = /compras\s?mx|compranet/i;

export function tenderSearchGuide(tender: SearchGuideInput): TenderSearchGuide | null {
  const origin = `${tender.buyer} ${tender.sourceName}`;

  if (PEMEX.test(origin)) {
    return {
      platform: "PEMEX — Concursos Abiertos",
      // The tender's own link is already the right subsidiary's list page
      // (pemex-mapper picks it per list title), so sending the reader to a
      // different subsidiary's page would be a step backwards.
      url: null,
      steps: [
        "打开上面的「前往官方投标入口」",
        "把招标编号粘贴到 Número de evento",
        "点击 Aplicar filtros",
      ],
    };
  }

  if (CFE.test(origin)) {
    return {
      platform: "CFE — Micrositio de Concursos",
      // No second link: a CFE tender's own 官方入口 is ALREADY the micrositio.
      // Ingestion rewrites it there rather than to the DOF notice it was read
      // from (CFE_BUYER_PATTERN / CFE_MICROSITIO_URL in
      // lib/ingestion/heuristics.ts, user's call 2026-09-05), so offering a
      // separate "打开 CFE 检索页" button would be the same destination twice.
      url: null,
      steps: [
        "打开上面的「前往官方投标入口」",
        "把招标编号粘贴到 Número de procedimiento",
        "点击 Buscar",
      ],
    };
  }

  if (SEACE.test(origin)) {
    return {
      platform: "SEACE — Sistema Electrónico de Contrataciones del Estado",
      // The only branch that carries its own link. A Peru tender's stored
      // 官方入口 is whatever host OECE's own `sources[].url` names (prodapp2),
      // while the path the user actually walked — and the one the ficha in
      // their screenshot lives on — is prod2. Same system, and rather than
      // guess which alias stays up, the verified one is spelled out here.
      url: "https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml",
      steps: [
        "打开 SEACE 公开检索页（下面的链接）",
        "点击 Buscador de Procedimiento de Selección",
        "点击 Búsqueda Avanzada",
        "把招标编号粘贴到 Sigla Nomenclatura",
        "点击 Buscar",
      ],
      note: "进入项目的 Ficha de Selección 后，右边的 Cronograma 里有完整时间表——包括本站拿不到的交标截止日（Presentación de propuestas）。",
    };
  }

  if (COMPRASMX.test(origin)) {
    // A resolved row already deep-links into the procedure itself.
    if (tender.sourceUrl.includes(COMPRASMX_DETAIL_PATH)) return null;
    return {
      platform: "Compras MX",
      url: null,
      steps: [
        "打开上面的「前往官方投标入口」",
        "确认上方选的是 Anuncios vigentes",
        "把招标编号粘贴到 Número de procedimiento / Proyecto",
        "点击 Buscar",
      ],
    };
  }

  return null;
}
