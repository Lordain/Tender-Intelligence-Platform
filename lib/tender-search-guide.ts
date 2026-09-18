import type { Tender } from "@/types/tender";
import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";

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
      // The only branch that carries its own link, and the reason this guide
      // matters more for Peru than anywhere else: a SEACE ficha URL cannot be
      // shared at all (lib/peru-seace-url.ts), so these five steps are not a
      // fallback for readers who lost the deep link — they ARE the route.
      //
      // One constant, because SEACE has moved its public route before and the
      // old host survived here for months only by being written in four
      // places.
      url: SEACE_PUBLIC_SEARCH_URL,
      steps: [
        "打开 SEACE 公开检索页（下面的链接）",
        // The landing tab is called out because the page opens on it with an
        // empty result table reading "No se encontraron Datos" (verified in
        // the user's browser, 2026-09-18). A reader who takes that as "the
        // link is broken" leaves before reaching the search — which is the
        // failure this whole panel exists to prevent, since for Peru these
        // steps are the only route to the tender.
        "页面默认停在第一个标签 Anuncio de Contratación Futura，表是空的——那不是这里，改点第二个标签 Buscador de Procedimientos de Selección",
        "点击 Búsqueda Avanzada",
        "把招标编号粘贴到 Sigla Nomenclatura",
        "点击 Buscar",
        // Steps 6 and 7 come from the user walking the path on 2026-09-18
        // after reading the panel as it shipped: 我发现步骤没有写全. Buscar
        // does not move the viewport, so the results appear below the fold
        // and the page looks unchanged to someone who does not scroll — the
        // same "nothing happened" that the empty landing tab produces two
        // steps earlier, and the same reason to spell it out.
        "往下滚到页面下半部分的结果清单",
        "点第一条记录最右边 Acciones 栏里的日历图标",
      ],
      // Reworded with step 7: the schedule is reached by that calendar icon,
      // so describing it as something found after entering the ficha named a
      // route the reader was no longer on.
      note: "第 7 步那个日历图标打开的就是 Cronograma——完整时间表，包括本站拿不到的交标截止日（Presentación de propuestas）。这个页面不要收藏：它的网址只在当前这次浏览会话里有效，下次打开是一张空表，得从检索页重新走一遍。",
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
