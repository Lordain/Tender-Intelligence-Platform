import type { TenderStatus } from "@/types/tender";

/**
 * Where an ANEEL transmission auction is in its life, read from its own
 * document list.
 *
 * Written after opening `documentos_editais.cfm?IdProgramaEdital=220` for
 * Leilão 001/2026 on 2026-09-18 and finding something more useful than the
 * money that page was opened for: **the edital does not exist yet.** The only
 * file under the "Edital" heading is
 *
 *   "Despacho 3.323, de 11/11/2025 — Autorização de envio da minuta do Edital
 *    do Leilão nº 1/2026 para apreciação do TCU e abertura de prazo para
 *    visitas técnicas"
 *
 * — an order authorising the DRAFT to be sent to the TCU (the federal audit
 * court) for review, and opening the window for site visits. Anexos,
 * Comunicado, Impugnações and Relatórios are all "Não existe nenhum arquivo".
 *
 * Two consequences, and the second is the product:
 *
 *  1. **There is no RAP ceiling and no investment figure to find**, anywhere,
 *     for this auction. Not hidden on another page — not yet written. Any
 *     mapper that treats a missing `estimatedValue` here as a fetch failure
 *     will retry forever against a number that does not exist.
 *  2. **This is the earliest formal signal a bidder can get**, months ahead of
 *     the edital, and lead time is precisely what a foreign consortium needs:
 *     partner selection, local incorporation, equipment planning. Listing it
 *     as 招标中 would be wrong; dropping it because it has no amount would
 *     throw away the reason to watch ANEEL at all. It is `planned`.
 *
 * ── Why the section alone cannot decide ───────────────────────────────────
 *
 * A file exists under "Edital", so "does the Edital section have a file" reads
 * as "the edital is out" — and it is not. The file's own title is what
 * separates a despacho about a draft from a published edital, which is why
 * this function reads titles rather than counting files.
 */

/** The six headings ANEEL's document page always prints, whether or not they hold files. */
export type AneelDocumentSection =
  | "edital"
  | "anexos"
  | "adendos"
  | "comunicado"
  | "impugnacoes"
  | "relatorios";

export type AneelDocumentEntry = {
  section: AneelDocumentSection;
  /** The link text plus whatever trails it, as printed. */
  title: string;
  url?: string;
};

export type AneelAuctionStage =
  /** Nothing published yet beyond the auction's existence. */
  | "announced"
  /** A despacho authorising the draft edital to go to the TCU — review under way. */
  | "tcu_review"
  /** The edital itself is published; bids can be prepared. */
  | "edital_published"
  /** Minutes or results are out. */
  | "results_published";

export type AneelAuctionReading = {
  stage: AneelAuctionStage;
  status: TenderStatus;
  /** True when a despacho opened the window for visits to the existing installations. */
  technicalVisitsOpen: boolean;
  /** The one sentence a reader needs about why this is or is not actionable yet. */
  note: string;
};

/**
 * A *minuta* is a draft, and a *despacho* is an administrative order about
 * one. Either word in the title of the only "Edital" file means the edital
 * itself has not been published, however full the section looks.
 */
const DRAFT_MARKERS = /\bminuta\b|\bdespacho\b|\bautoriza[çc][ãa]o\b/i;
const TCU_REVIEW = /\bTCU\b|Tribunal de Contas/i;
const TECHNICAL_VISITS = /visitas?\s+t[ée]cnicas?/i;
/** A real edital's own title says so, and says it without calling itself a draft. */
const PUBLISHED_EDITAL = /\bedital\b/i;

export function readAneelAuctionStage(entries: AneelDocumentEntry[]): AneelAuctionReading {
  const inSection = (section: AneelDocumentSection) => entries.filter((entry) => entry.section === section);
  const technicalVisitsOpen = entries.some((entry) => TECHNICAL_VISITS.test(entry.title));

  // Results first: once minutes or results exist, nothing earlier matters.
  if (inSection("relatorios").length > 0) {
    return {
      stage: "results_published",
      status: "awarded",
      technicalVisitsOpen,
      note: "已出结果或会议纪要 —— 这场已经拍完了，对应的是中标方/中标金额那一侧。",
    };
  }

  const editalFiles = inSection("edital");
  const published = editalFiles.filter((entry) => PUBLISHED_EDITAL.test(entry.title) && !DRAFT_MARKERS.test(entry.title));
  if (published.length > 0) {
    return {
      stage: "edital_published",
      status: "open",
      technicalVisitsOpen,
      note: "招标文件已发布 —— 标段的 RAP 上限和预估投资就在 edital 及其附件里。",
    };
  }

  const draftToTcu = editalFiles.filter((entry) => DRAFT_MARKERS.test(entry.title) && TCU_REVIEW.test(entry.title));
  if (draftToTcu.length > 0) {
    return {
      stage: "tcu_review",
      status: "planned",
      technicalVisitsOpen,
      note: technicalVisitsOpen
        ? "招标文件还没发 —— 目前只批准了把草案送审计法院（TCU），同时开放了现场踏勘。这是能拿到的最早信号，金额还不存在，不是抓取失败。"
        : "招标文件还没发 —— 目前只批准了把草案送审计法院（TCU）审。这是能拿到的最早信号，金额还不存在，不是抓取失败。",
    };
  }

  return {
    stage: "announced",
    status: "planned",
    technicalVisitsOpen,
    note: editalFiles.length > 0
      ? "「Edital」栏下有文件，但标题看不出是正式招标文件 —— 先按未发布处理，别当成在招。"
      : "只公布了这场拍卖的存在，一份文件都还没上传。",
  };
}
