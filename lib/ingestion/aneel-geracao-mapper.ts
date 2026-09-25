import type { Tender } from "@/types/tender";
import { untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { readAneelAuctionStage, type AneelAuctionReading, type AneelDocumentEntry } from "@/lib/ingestion/aneel-auction-stage";
import type { AneelEdital } from "@/lib/ingestion/connectors/aneel-editais-file";
import { findConsultaForAuction, consultaLabel, type AneelConsultaPublica } from "@/lib/ingestion/aneel-consulta-publica";

export const ANEEL_GERACAO_SOURCE_NAME = "ANEEL — Leilão de Geração";

const AUCTION_PAGE = "https://www2.aneel.gov.br/aplicacoes_liferay/editais_geracao/edital_geracao.cfm";

/**
 * One ANEEL generation / capacity auction becomes ONE tender.
 *
 * ── Why not one per lot, like transmission ────────────────────────────────
 *
 * Because there are no lots. Measured on the real 2026 capture: the
 * Empreendimentos cell of both LRCAP auctions is empty, and running the
 * transmission mapper over that page produced exactly zero rows — it maps
 * `edital.lotes`, and there are none. The auction itself is the opportunity
 * here, and its whole description is the Objeto sentence.
 *
 * ── The one signal worth reading out of that sentence ─────────────────────
 *
 * LRCAP 003/2026 contracts capacity "a partir de empreendimentos de geração
 * EXISTENTES". 002/2026 says "novos e existentes". That single word decides
 * whether this auction is worth a supplier's time at all: an auction open
 * only to existing plants is a contract for capacity somebody already built,
 * with nothing to sell into. One that admits new projects is a build.
 *
 * So it drives `scopeType` (works when something gets built, services when
 * the auction merely re-contracts existing capacity) and it is said plainly
 * in Chinese in the summary, because the distinction is invisible to a reader
 * skimming two nearly identical Portuguese sentences.
 *
 * ── No amount, again, and for a worse reason than transmission ────────────
 *
 * The transmission page at least links reports R1–R5, which are the per-lot
 * economic studies. The generation page links no reports at all — only the
 * consultation and the document list. There is nothing on this page, or one
 * click from it, that carries an investment figure.
 */
export type AneelGeracaoMappingInput = {
  edital: AneelEdital;
  documents?: AneelDocumentEntry[];
  publicationDate?: string;
  consulta?: AneelConsultaPublica | null;
};

/** "novos e existentes" / "novos" → something gets built. "existentes" alone → it does not. */
export function admitsNewProjects(objeto: string | null): boolean {
  return objeto !== null && /\bnovos?\b/i.test(objeto);
}

/** LRCAP, LRE, LEE … the auction's own short name, when the Objeto states one. */
function auctionKind(objeto: string | null): string | null {
  return /\b(LRCAP|LRE|LEE|LEN|LFA)\b/i.exec(objeto ?? "")?.[1]?.toUpperCase() ?? null;
}

/**
 * The part of the Objeto that says what is being contracted, without the
 * boilerplate. "LRCAP de 2026 - UTEs a Óleo e Biodiesel" is the useful half of
 * a sentence whose other half is identical across every auction ANEEL runs.
 */
function subject(objeto: string | null): string | null {
  if (!objeto) return null;
  // Two cuts, because ANEEL uses two separators in one sentence. " - " divides
  // the auction's formal name from its short name from the technology; the
  // boilerplate that follows is joined by a COMMA, inside the last segment:
  //
  //   "… de 2026 - LRCAP de 2026 - UTEs a Óleo e Biodiesel, destinado a
  //    contratar Potência Elétrica a partir de empreendimentos …"
  //
  // Splitting on the dash alone therefore returns the technology WITH the
  // whole boilerplate attached, which is how the first version put a
  // 30-word sentence in the title.
  const dashed = objeto.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (dashed.length < 2) return null;
  const last = dashed[dashed.length - 1].split(/,\s*destinad[oa]\s+a/i)[0].trim().replace(/[.,;]+$/, "");
  return last.length > 0 ? last : null;
}

function geracaoTitle(edital: AneelEdital): string {
  const what = subject(edital.objeto);
  const head = `Leilão de Geração ANEEL nº ${edital.auctionNumber ?? "?"}/${edital.year ?? "?"}`;
  const kind = auctionKind(edital.objeto);
  return [head, kind && kind !== what ? kind : null, what].filter(Boolean).join(" — ");
}

function geracaoSummary(edital: AneelEdital, reading: AneelAuctionReading): string {
  const parts: string[] = [];
  if (edital.objeto) parts.push(edital.objeto);
  parts.push(
    admitsNewProjects(edital.objeto)
      ? "面向新建及已有发电项目 —— 含新建，存在设备供货与 EPC 机会。"
      : "仅面向已有发电项目（empreendimentos existentes）—— 这是对已建成容量的再签约，没有新建设备采购机会。",
  );
  // This page has no lots and no reports, so the document list is the only
  // place a technical specification can come from. Say where it is.
  if (edital.links.documentosUrl) parts.push(`标书与附件：${edital.links.documentosUrl}`);
  const consulta = reading.consulta;
  if (consulta) {
    parts.push(`${consultaLabel(consulta)}：${consulta.opensOn} 至 ${consulta.closesOn} 征询意见${consulta.contributionsEmail ? `（${consulta.contributionsEmail}）` : ""}。${consulta.note}`);
    if (!consulta.confirmed) parts.push("（公众咨询的日期与金额来自行业媒体，尚未与 ANEEL 官网核对。）");
  } else if (edital.links.consultaPublicaUrl) {
    parts.push(`该场次页面链接了公众咨询：${edital.links.consultaPublicaUrl}`);
  }
  parts.push(reading.note);
  return parts.join(" ");
}

export function mapAneelGeracaoToTenders(input: AneelGeracaoMappingInput, now: Date = new Date()): Tender[] {
  const { edital } = input;
  if (edital.auctionNumber === null || edital.year === null) return [];

  const consulta =
    input.consulta !== undefined
      ? input.consulta
      : findConsultaForAuction(edital.auctionNumber, edital.year, "reserva_capacidade");
  const reading = readAneelAuctionStage(input.documents ?? [], consulta, now);

  const nowIso = now.toISOString();
  const publicationDate = input.publicationDate ?? nowIso;
  const publicationDateIsEstimated = input.publicationDate === undefined;

  const title = geracaoTitle(edital);
  const summary = geracaoSummary(edital, reading);
  const tenderNumber = `Leilão ${edital.auctionNumber}/${edital.year}-ANEEL`;
  // A capacity auction open only to existing plants contracts a service, not
  // a build. See admitsNewProjects — this is the field that decides whether
  // an equipment supplier ever sees the row through a scope filter.
  const scopeType = admitsNewProjects(edital.objeto) ? "works" : "services";

  const { industries, relevance } = classifyStoredTender({
    procedureType: "Leilão de Reserva de Capacidade",
    tenderNumber,
    title,
    summary,
    buyer: "Agência Nacional de Energia Elétrica (ANEEL)",
    country: "Brazil",
    governmentLevel: "federal",
    scopeType,
    sourceName: ANEEL_GERACAO_SOURCE_NAME,
  });

  return [{
    id: crypto.randomUUID(),
    slug: `aneel-geracao-${edital.year}-${edital.auctionNumber}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer: "Agência Nacional de Energia Elétrica (ANEEL)",
    country: "Brazil",
    governmentLevel: "federal",
    industries,
    scopeType,
    procedureType: "Leilão de Reserva de Capacidade",
    publicationDate,
    ...(publicationDateIsEstimated ? { publicationDateIsEstimated: true } : {}),
    status: reading.status,
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [
      { id: `aneel-geracao-${edital.year}-${edital.auctionNumber}-publication`, type: "publication", date: publicationDate },
      ...(consulta
        ? [{
            id: `aneel-geracao-${edital.year}-${edital.auctionNumber}-consulta`,
            type: "questions_deadline" as const,
            date: consulta.closesOn,
            notes: {
              es: `${consultaLabel(consulta)} — plazo para contribuciones sobre la minuta del edital`,
              en: `${consultaLabel(consulta)} — deadline for contributions on the draft edital`,
              zh: `${consultaLabel(consulta)} —— 标书草案意见征询截止`,
            },
          }]
        : []),
      ...(consulta?.auctionDate
        ? [{
            id: `aneel-geracao-${edital.year}-${edital.auctionNumber}-leilao`,
            type: "opening" as const,
            date: consulta.auctionDate,
            notes: { es: "Sesión del leilão", en: "Auction session", zh: "拍卖日" },
          }]
        : []),
    ],
    risks: [],
    relevance,
    sourceName: ANEEL_GERACAO_SOURCE_NAME,
    sourceUrl: AUCTION_PAGE,
    createdAt: nowIso,
    updatedAt: nowIso,
  } satisfies Tender];
}
