import type { Tender } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { readAneelAuctionStage, type AneelAuctionReading, type AneelDocumentEntry } from "@/lib/ingestion/aneel-auction-stage";
import type { AneelEdital } from "@/lib/ingestion/connectors/aneel-editais-file";
import type { AneelLote } from "@/lib/ingestion/aneel-lote-parser";

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
 * RAP ceiling and the investment estimate do not exist yet, anywhere. This
 * mapper therefore never invents one, and specifically never falls back to
 * RAP once that number does appear: RAP is an annual revenue cap and the
 * figure this platform shows is the estimated investment (user, 2026-09-18).
 * Setting it to 0 would be worse than leaving it out, because 0 reads as
 * "worth nothing" to the value floor.
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
  parts.push(reading.note);
  return parts.join(" ");
}

export function mapAneelEditalToTenders(input: AneelMappingInput, now: Date = new Date()): Tender[] {
  const { edital } = input;
  if (edital.auctionNumber === null || edital.year === null) return [];

  const reading = readAneelAuctionStage(input.documents ?? []);
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
      keyDates: [{ id: `${slugify(tenderNumber)}-publication`, type: "publication", date: publicationDate }],
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
