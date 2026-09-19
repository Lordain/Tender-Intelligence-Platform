import type { TenderStatus } from "@/types/tender";
import {
  consultaWindowState,
  consultaLabel,
  type AneelConsultaPublica,
} from "@/lib/ingestion/aneel-consulta-publica";

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
 *  1. **No RAP ceiling and no investment figure exist on this page**, and for
 *     1/2026 at this stage none existed anywhere. Any mapper that treats a
 *     missing `estimatedValue` here as a fetch failure will retry forever
 *     against a number that has not been written yet. (Corrected 2026-09-19:
 *     the generalisation that the number never exists before the edital is
 *     wrong — it appears at the CONSULTA PÚBLICA, which is earlier than
 *     everything described here. Leilão 1/2027 was announced at R$ 12,9 bi
 *     when CP 032/2026 opened. See aneel-consulta-publica.ts.)
 *  2. **This is the earliest signal on THIS page**, months ahead of
 *     the edital (the consulta pública, on ANEEL's consultations portal, is
 *     earlier still), and lead time is precisely what a foreign consortium needs:
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
  /**
   * The draft edital is out for public comment. Earlier than `tcu_review`,
   * and the first stage that carries an investment figure — see
   * lib/ingestion/aneel-consulta-publica.ts for why that reverses this
   * file's original reading.
   */
  | "consulta_publica"
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
  /** The consultation this reading was given, when one applies — null otherwise. */
  consulta: AneelConsultaPublica | null;
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
/**
 * ANEEL names a consultation three ways in document titles: in full, as
 * "CP nnn/aaaa", or — when it is gathering input before drafting at all — as
 * a "tomada de subsídios". Any of them means the draft is still open to
 * comment, which is a different thing from being under TCU review.
 */
const CONSULTATION = /consulta\s+p[úu]blica|tomada\s+de\s+subs[íi]dios|\bCP\s*n?[ºo°.]?\s*\d{1,3}\s*\/\s*\d{4}/i;

export function readAneelAuctionStage(
  entries: AneelDocumentEntry[],
  consulta: AneelConsultaPublica | null = null,
  now: Date = new Date(),
): AneelAuctionReading {
  const inSection = (section: AneelDocumentSection) => entries.filter((entry) => entry.section === section);
  const technicalVisitsOpen = entries.some((entry) => TECHNICAL_VISITS.test(entry.title));

  // Results first: once minutes or results exist, nothing earlier matters.
  if (inSection("relatorios").length > 0) {
    return {
      stage: "results_published",
      status: "awarded",
      technicalVisitsOpen,
      consulta,
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
      consulta,
      note: "招标文件已发布 —— 标段的 RAP 上限和预估投资就在 edital 及其附件里。",
    };
  }

  const draftToTcu = editalFiles.filter((entry) => DRAFT_MARKERS.test(entry.title) && TCU_REVIEW.test(entry.title));
  if (draftToTcu.length > 0) {
    return {
      stage: "tcu_review",
      status: "planned",
      technicalVisitsOpen,
      consulta,
      note: technicalVisitsOpen
        ? "招标文件还没发 —— 目前只批准了把草案送审计法院（TCU），同时开放了现场踏勘。这是能拿到的最早信号，金额还不存在，不是抓取失败。"
        : "招标文件还没发 —— 目前只批准了把草案送审计法院（TCU）审。这是能拿到的最早信号，金额还不存在，不是抓取失败。",
    };
  }

  // Below TCU review and above "nothing published". A consultation is
  // evidenced two ways — a document title on ANEEL's own page, or a
  // consultation record handed in by the caller — and either is enough.
  const consultationNamed = entries.some((entry) => CONSULTATION.test(entry.title));
  if (consulta || consultationNamed) {
    const state = consulta ? consultaWindowState(consulta, now) : "open";
    const label = consulta ? consultaLabel(consulta) : "公众咨询";
    const money = consulta?.announcedInvestmentBrl
      ? `整场公告投资额 R$ ${(consulta.announcedInvestmentBrl / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi（全场合计，未按标段拆分）。`
      : "";
    const note =
      state === "open"
        ? `${label} 进行中，${consulta ? `意见征询截止 ${consulta.closesOn}` : "意见征询进行中"} —— 标书草案（minuta）此时已可下载，技术指标仍可提意见。这是能拿到的最早信号。${money}`
        : state === "upcoming"
          ? `${label} 尚未开始${consulta ? `，${consulta.opensOn} 开放意见征询` : ""}。${money}`
          : `${label} 已结束${consulta ? `（${consulta.closesOn} 截止）` : ""} —— 草案已定稿，下一步是送 TCU 审、再发正式 edital。技术指标此时基本不再改。${money}`;
    return { stage: "consulta_publica", status: "planned", technicalVisitsOpen, consulta, note: note.trim() };
  }

  return {
    stage: "announced",
    status: "planned",
    technicalVisitsOpen,
    consulta,
    note: editalFiles.length > 0
      ? "「Edital」栏下有文件，但标题看不出是正式招标文件 —— 先按未发布处理，别当成在招。"
      : "只公布了这场拍卖的存在，一份文件都还没上传。",
  };
}
