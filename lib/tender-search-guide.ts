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
  /** Replaces the panel's "search by the number above" line where the number is not how the row is found. */
  intro?: string;
  note?: string;
};

type SearchGuideInput = Pick<Tender, "buyer" | "sourceName" | "sourceUrl">;

/** A Compras MX row whose LicitIA lookup resolved gets a real detail URL; an unresolved one falls back to the bare search page. */
const COMPRASMX_DETAIL_PATH = "/detalle/";

const PEMEX = /pemex|petr[oó]leos mexicanos/i;
const CFE = /comisi[oó]n federal de electricidad|\bcfe\b/i;
const SEACE = /\boece\b|\bseace\b/i;
const COMPRASMX = /compras\s?mx|compranet/i;
const PETRONECT = /petronect/i;
const PETROPERU = /petroper[uú]/i;
const CODELCO = /codelco/i;

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
        // "第二个" earns its place: the page lands on a different tab showing
        // an empty table, and a reader who cannot find this one quickly reads
        // that emptiness as a broken link. Naming the position gets them past
        // it in one glance — which is all that was needed. An earlier version
        // also described the landing tab and warned it was the wrong one;
        // that was commentary inside a numbered instruction, and it explained
        // a dead end the instruction already walks around.
        "点击第二个标签 Buscador de Procedimientos de Selección",
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

  // The three company sources added on 2026-09-25 with no per-tender page
  // (user: 详情页的官方入口指导(如有需要)). Cemig and UPME are not here:
  // their 官方入口 already opens the process's own page. Field names below
  // are copied from the pages as served that day.
  if (PETRONECT.test(origin)) {
    return {
      platform: "Petronect — Oportunidades Abertas",
      // The tender's link is the public list itself (PETRONECT_LIST_URL);
      // Petronect has no per-opportunity URL.
      url: null,
      steps: [
        "打开上面的「前往官方投标入口」",
        "把招标编号粘贴到列表上方的 BUSCAR POR... 搜索框",
        "点击搜索框右侧的放大镜",
      ],
      note: "结果中的 Abrangência 一栏：Internacional 表示境外供应商可以报价，Nacional 表示只限巴西供应商。报价要先完成 Petrobras 供应商登记，并登录 Petronect。",
    };
  }

  if (PETROPERU.test(origin)) {
    return {
      platform: "Petroperú — Competencia internacional",
      url: null,
      steps: [
        "打开上面的「前往官方投标入口」",
        "在列表里找到这个编号（按发布日期从新到旧排列）",
        "打开这一行，查看 Bases 和之后上传的全部文件",
      ],
      // The list states no deadline, and a PCI's schedule moves: the 2025
      // catalyst call had twenty "Modificación cronograma" uploads.
      note: "交标截止日写在 Bases 里，并会随「Modificación de cronograma」（日程修改）变动，以最新上传的那份为准。报价前须在 Petroperú 合格供应商库（BDPC）完成登记。",
    };
  }

  if (CODELCO.test(origin)) {
    return {
      platform: "Codelco — Licitaciones en proceso",
      url: null,
      intro: "官方没有单个项目的页面，需要在官网的招标表格里找到这一行。",
      steps: [
        "打开上面的「前往官方投标入口」",
        "在表格里按 Fecha（发布日期）和 Rubro o material（标的）找到这一行",
        "点击标的名称，打开招标公告（llamado público）",
        "在 Fecha de entrega 之前，按公告要求表达参与意向",
      ],
      // codelcoTenderNumber falls back to a site-made id when the subject
      // carries no Ariba WS/Doc number, so the copy button can't be the route.
      note: "Codelco 的招标文件只在 SAP Ariba 上发给受邀供应商。上面的编号如果不是 WS 或 Doc 开头，是本站生成的，官网上搜不到，请按日期和标的查找。",
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
