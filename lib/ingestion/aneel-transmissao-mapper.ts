import type { Tender, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { readAneelAuctionStage, type AneelAuctionReading, type AneelDocumentEntry } from "@/lib/ingestion/aneel-auction-stage";
import type { AneelEdital } from "@/lib/ingestion/connectors/aneel-editais-file";
import type { AneelLote } from "@/lib/ingestion/aneel-lote-parser";
import {
  findConsultaForAuction,
  consultaLabel,
  type AneelConsultaPublica,
} from "@/lib/ingestion/aneel-consulta-publica";

export const ANEEL_SOURCE_NAME = "ANEEL — Leilão de Transmissão";

const AUCTION_PAGE = "https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm";

/**
 * One ANEEL transmission auction becomes one tender per LOTE.
 *
 * ── Why a lot and not the auction ─────────────────────────────────────────
 *
 * Each lot is its own concession contract, bid separately, with its own
 * revenue cap, its own investment and its own winner. A bidder takes lot 3 and
 * ignores the other nine, so an auction stored as a single row merges ten
 * unrelated opportunities into something nobody can read or filter.
 *
 * ── Why `estimatedValue` is deliberately absent ───────────────────────────
 *
 * Measured on Leilão 001/2026 (2026-09-18): the edital is not published — the
 * only document is a despacho authorising the DRAFT to go to the TCU — so the
 * RAP ceiling and the per-lot investment estimate do not exist yet. This
 * mapper therefore never invents one, and specifically never falls back to
 * RAP once that number does appear: RAP is an annual revenue cap and the
 * figure this platform shows is the estimated investment (user, 2026-09-18).
 * Setting it to 0 would be worse than leaving it out, because 0 reads as
 * "worth nothing" to the value floor.
 *
 * A consulta pública DOES announce a figure — R$ 12,9 bi for Leilão 1/2027 —
 * but it is the whole auction's CAPEX across twelve lots, and ANEEL does not
 * publish the split. Dividing it would put a fabricated number on every row,
 * so it is named in the summary and `estimatedValue` still stays empty. The
 * rule is unchanged: a per-lot amount is only ever set from a per-lot source.
 *
 * ── A sublote is not a row, yet ───────────────────────────────────────────
 *
 * Lot 3 of this auction is split into 3A–3D. Whether ANEEL takes bids per
 * sublote or per lot is not stated on the page, and inventing four rows from
 * an unverified reading would be four wrong tenders rather than one honest
 * one. They are named in the summary and left as one row until the edital says
 * otherwise.
 */
export type AneelMappingInput = {
  edital: AneelEdital;
  /** The document list from `documentos_editais.cfm`, when it has been captured. */
  documents?: AneelDocumentEntry[];
  /**
   * When the auction was first published. ANEEL's page carries no publication
   * date, so the caller passes the despacho's date when it has one; otherwise
   * the row is stamped with the capture time and flagged as estimated, the
   * same convention Compras MX's dateless export uses.
   */
  publicationDate?: string;
  /**
   * The consultation whose draft edital this is, when one is known. Passing
   * `null` explicitly suppresses the lookup; leaving it out looks the auction
   * up in ANEEL_CONSULTAS, so a captured page for an auction already in
   * consultation is staged correctly without the caller knowing about it.
   */
  consulta?: AneelConsultaPublica | null;
};

function loteTitle(edital: AneelEdital, lote: AneelLote): string {
  const where = lote.ufs.length > 0 ? ` (${lote.ufs.join("/")})` : "";
  // The installations ARE the description — "Lote 3" alone says nothing, and
  // this platform's own no-content rule would rightly exclude it.
  const what = lote.installations.slice(0, 3).join("; ");
  const more = lote.installations.length > 3 ? ` e mais ${lote.installations.length - 3} instalações` : "";
  return `Leilão de Transmissão ANEEL nº ${edital.auctionNumber ?? "?"}/${edital.year ?? "?"} — Lote ${lote.number}${where}: ${what}${more}`;
}

function loteSummary(lote: AneelLote, reading: AneelAuctionReading): string {
  const parts: string[] = [];
  parts.push(`Lote ${lote.number}${lote.ufs.length > 0 ? ` — ${lote.ufs.join(", ")}` : ""}.`);
  if (lote.sublotes.length > 0) parts.push(`Dividido em sublotes ${lote.sublotes.join(", ")}.`);
  if (lote.hasContinuity && lote.hasNewInstallations) parts.push("Inclui continuidade da prestação de serviço em instalações existentes e novas instalações de transmissão.");
  else if (lote.hasContinuity) parts.push("Continuidade da prestação de serviço em instalações existentes.");
  else if (lote.hasNewInstallations) parts.push("Novas instalações de transmissão.");
  if (lote.maxVoltageKv) parts.push(`Tensão máxima ${lote.maxVoltageKv} kV.`);
  parts.push(lote.text.replace(/\s*\n\s*/g, " ").trim());
  const consulta = reading.consulta;
  if (consulta) {
    parts.push(
      `${consultaLabel(consulta)}：${consulta.opensOn} 至 ${consulta.closesOn} 征询意见${consulta.contributionsEmail ? `（${consulta.contributionsEmail}）` : ""}。${consulta.note}`,
    );
    if (!consulta.confirmed) {
      parts.push("（公众咨询的日期与金额来自行业媒体，尚未与 ANEEL 官网核对。）");
    }
  }
  parts.push(reading.note);
  return parts.join(" ");
}

export function mapAneelEditalToTenders(input: AneelMappingInput, now: Date = new Date()): Tender[] {
  const { edital } = input;
  if (edital.auctionNumber === null || edital.year === null) return [];

  const consulta =
    input.consulta !== undefined
      ? input.consulta
      : findConsultaForAuction(edital.auctionNumber, edital.year, "transmissao");
  const reading = readAneelAuctionStage(input.documents ?? [], consulta, now);
  const nowIso = now.toISOString();
  const publicationDate = input.publicationDate ?? nowIso;
  const publicationDateIsEstimated = input.publicationDate === undefined;

  return edital.lotes.map((lote) => {
    const title = loteTitle(edital, lote);
    const summary = loteSummary(lote, reading);
    const tenderNumber = `Leilão ${edital.auctionNumber}/${edital.year}-ANEEL — Lote ${lote.number}`;

    const { industries, relevance } = classifyStoredTender({
      procedureType: "Leilão de Transmissão",
      title,
      summary,
      buyer: "Agência Nacional de Energia Elétrica (ANEEL)",
      country: "Brazil",
      governmentLevel: "federal",
      // The winner builds and operates the line for thirty years. It is works,
      // whatever share of the lot is taking over existing assets.
      scopeType: "works",
      sourceName: ANEEL_SOURCE_NAME,
    });

    return {
      id: crypto.randomUUID(),
      slug: `aneel-transmissao-${edital.year}-${edital.auctionNumber}-lote-${slugify(String(lote.number))}`,
      tenderNumber,
      title: untranslated(title),
      summary: untranslated(summary),
      buyer: "Agência Nacional de Energia Elétrica (ANEEL)",
      country: "Brazil",
      governmentLevel: "federal",
      industries,
      scopeType: "works",
      procedureType: "Leilão de Transmissão",
      publicationDate,
      ...(publicationDateIsEstimated ? { publicationDateIsEstimated: true } : {}),
      ...(lote.ufs.length > 0 ? { location: lote.ufs.join("/") } : {}),
      status: reading.status,
      qualifications: [],
      experienceRequirements: [],
      requiredDocuments: [],
      keyDates: [
        { id: `${slugify(tenderNumber)}-publication`, type: "publication", date: publicationDate },
        // A consulta pública takes written contributions until a stated day.
        // That is a questions deadline in everything but name — it is the
        // window in which a bidder can still argue a technical spec — and it
        // reuses `questions_deadline` rather than adding a key-date type,
        // which would need a migration for no semantic gain.
        ...(consulta
          ? [{
              id: `${slugify(tenderNumber)}-consulta`,
              type: "questions_deadline" as const,
              date: consulta.closesOn,
              notes: {
                es: `${consultaLabel(consulta)} — plazo para contribuciones sobre la minuta del edital`,
                en: `${consultaLabel(consulta)} — deadline for contributions on the draft edital`,
                zh: `${consultaLabel(consulta)} —— 标书草案意见征询截止`,
              },
            }]
          : []),
        // The auction session itself, when the schedule names a single day.
        ...(consulta?.auctionDate
          ? [{
              id: `${slugify(tenderNumber)}-leilao`,
              type: "opening" as const,
              date: consulta.auctionDate,
              notes: { es: "Sesión del leilão", en: "Auction session", zh: "拍卖日" },
            }]
          : []),
      ],
      risks: [],
      relevance,
      sourceName: ANEEL_SOURCE_NAME,
      // The auction page itself. It is POST-driven by year, so this URL shows
      // the current year's auction — correct while the auction is live, which
      // is the whole window in which a reader would click it.
      sourceUrl: AUCTION_PAGE,
      createdAt: nowIso,
      updatedAt: nowIso,
    } satisfies Tender;
  });
}

/**
 * Is this auction still worth writing — or is it history?
 *
 * The user's rule (2026-09-19: 已经逾期的项目我不要，只要正在招标、未发标的):
 * keep `planned` and `open`, drop anything already decided.
 *
 * ── Why the status alone is not enough, and this is the trap ──────────────
 *
 * `edital_transmissao.cfm` has a year selector going back to 1999, and every
 * past year renders in the SAME template as the current one. Save 2015's page
 * and the reader returns ten perfectly good lots with no dates on them
 * anywhere — the page carries no publication date at all, which is why the
 * mapper stamps the capture time and flags it estimated.
 *
 * Feed that to readAneelAuctionStage with no document list and it returns
 * `announced` -> `planned`, because "no files captured" is genuinely
 * indistinguishable from "no files uploaded yet" when all you have is the
 * auction page. So a 2015 auction, concluded a decade ago, would import as
 * ten upcoming opportunities. That is the single most expensive thing this
 * source can do: a fabricated pipeline is worse than an empty one.
 *
 * The year is the missing evidence. An auction numbered for a past year whose
 * documents were NOT captured is finished — not planned — and the only thing
 * that can overturn that is a real document list saying otherwise (an edital
 * published late in year N can legitimately still be open in N+1, and the
 * reading sees that because a document list was captured).
 */
export type AneelLiveness = { live: boolean; status: TenderStatus; reason: string };

export function aneelAuctionLiveness(
  edital: AneelEdital,
  documents: AneelDocumentEntry[] = [],
  consulta: AneelConsultaPublica | null = null,
  now: Date = new Date(),
): AneelLiveness {
  const reading = readAneelAuctionStage(documents, consulta, now);

  if (reading.stage === "results_published") {
    return { live: false, status: reading.status, reason: "已出结果/会议纪要 —— 这场拍完了。" };
  }

  // The year guard, and only where it is actually evidence: with a document
  // list captured, the reading is a reading and it wins.
  const currentYear = now.getFullYear();
  if (documents.length === 0 && edital.year !== null && edital.year < currentYear) {
    return {
      live: false,
      status: "awarded",
      reason: `${edital.year} 年的场次，且没有传入文档清单 —— 按已结束处理。往年页面和今年长得一模一样，没有文档清单时「planned」只是默认值，不是判断。要导入请补 --documents。`,
    };
  }

  return { live: true, status: reading.status, reason: reading.note };
}
