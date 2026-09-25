import type { GovernmentLevel, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * One row from PNCP's search index — `GET https://pncp.gov.br/api/search`.
 *
 * Every field name here was read off real returned rows (see
 * lib/ingestion/README.md's Brazil section for the four probe runs that
 * established them), not from a Swagger page. The index identifies itself as
 * `"index": "catalog2", "doc_type": "_doc"` — it is Elasticsearch, and that
 * is why it stays up while `/api/consulta`, the relational service, spends
 * days returning Hikari JDBC pool errors.
 *
 * Three traps this shape carries, all measured:
 *
 *  1. `title` is NOT descriptive. It is the notice's own number, e.g.
 *     "Edital nº 044/2026" — the same trap Peru's OCDS `tender.title` has.
 *     The object text is `description`.
 *  2. `valor_global` was null on 200 of 200 rows across two samples. The
 *     amount lives in the ITEM list on a different host; see
 *     `sumPncpItemValues` below.
 *  3. Timestamps carry NO offset and are Brasília time, not UTC. Confirmed
 *     by running the probes against the clock: `/api/pncp` stamps its own
 *     errors `-03:00` while `/api/consulta` stamps the same instant
 *     `+00:00`, and a row created while the user's terminal read 11:00 BRT
 *     came back `2026-09-18T11:00:01`. Parsing these as UTC would shift
 *     every date three hours earlier, which for a `data_fim_vigencia` late
 *     in the day moves the deadline to the previous calendar day — and a
 *     deadline off by one day is the kind of error this platform exists to
 *     not make.
 */
export type PncpSearchRow = {
  id?: string;
  title?: string;
  description?: string;
  item_url?: string;
  numero_controle_pncp?: string;
  ano?: string;
  numero_sequencial?: string;
  orgao_cnpj?: string;
  orgao_nome?: string;
  unidade_nome?: string;
  esfera_id?: string;
  esfera_nome?: string;
  poder_nome?: string;
  municipio_nome?: string;
  uf?: string;
  modalidade_licitacao_id?: string;
  modalidade_licitacao_nome?: string;
  situacao_nome?: string;
  data_publicacao_pncp?: string;
  data_atualizacao_pncp?: string;
  data_inicio_vigencia?: string;
  data_fim_vigencia?: string;
  cancelado?: boolean;
  valor_global?: number | null;
  tem_resultado?: boolean;
};

/**
 * One item from `GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens`.
 *
 * This endpoint is the only one of four tried that answers (3.7s). The compra
 * RECORD was moved to `/api/consulta` — which is down — and its item list was
 * not moved, which is the only reason a Brazilian amount is reachable at all.
 */
export type PncpItem = {
  numeroItem?: number;
  descricao?: string;
  materialOuServico?: string;
  valorUnitarioEstimado?: number | null;
  valorTotal?: number | null;
  quantidade?: number | null;
  /** Lei 14.133 lets a buyer seal the estimate. True means the amount is withheld BY LAW, not missing by accident — see sumPncpItemValues. */
  orcamentoSigiloso?: boolean;
  situacaoCompraItemNome?: string;
  temResultado?: boolean;
};

/** Brasília time. See the PncpSearchRow note — these timestamps carry no offset and are not UTC. */
const BRASILIA_OFFSET = "-03:00";

/**
 * A PNCP timestamp as a real instant.
 *
 * Handles the three shapes seen in real rows — `2026-05-18T09:30`,
 * `2026-04-07T09:43:49.860230` and `2026-09-18T11:00:00.857680007` (nine
 * fractional digits, which `new Date()` accepts but which no other source
 * here produces). Anything already carrying an offset or a trailing Z is
 * left alone rather than double-stamped.
 */
export function parsePncpDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (text === "") return undefined;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  // Trim to milliseconds: Date accepts extra digits but silently, and keeping
  // nine of them in a stored ISO string is noise no reader benefits from.
  const trimmed = text.replace(/(\.\d{3})\d+$/, "$1");
  const parsed = new Date(hasZone ? trimmed : `${trimmed}${BRASILIA_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getUTCFullYear();
  // Same guard the DOF mapper grew after a five-digit year was truncated to
  // 0202 — a date outside this range is a source defect, not a tender.
  if (year < 2000 || year > 2100) return undefined;
  return parsed.toISOString();
}

/**
 * `esfera_id` is the authority, not `esfera_nome`.
 *
 * Real values seen: "M" (Municipal), "E" (Estadual), "F" (Federal), and rows
 * whose `esfera_nome` reads "Não se aplica" — which is a real state, not a
 * parsing failure: PNCP carries entities (state companies, autarquias,
 * consórcios) that do not sit on the federal/state/municipal ladder.
 *
 * Those fall back to "public_company" rather than to a guessed tier, because
 * this platform's governmentLevel feeds relevance and inventing "federal" for
 * an unknown would promote tenders on a fiction.
 */
export function inferGovernmentLevel(esferaId: string | undefined): GovernmentLevel {
  switch ((esferaId ?? "").toUpperCase()) {
    case "F":
      return "federal";
    case "E":
      return "state";
    case "M":
      return "municipal";
    default:
      return "public_company";
  }
}

/**
 * Scope from the Portuguese object text.
 *
 * PNCP's own `materialOuServico` flag cannot do this job: the MT-020/251 road
 * construction — 7.5 million reais of pavement — is filed as "Serviço". So
 * the split has to come from the words, and the order below is load-bearing.
 *
 * WORKS FIRST, deliberately. A design-build contract ("ELABORAÇÃO DE PROJETOS
 * EXECUTIVOS E EXECUÇÃO DE OBRA DE CONSTRUÇÃO DE QUADRA POLIESPORTIVA", a real
 * title from the 2026-09-18 corpus) contains both vocabularies, and it is a
 * works contract with design attached, not a design study.
 */
const WORKS_PT = /\bobras?\b|constru[çc][ãa]o|pavimenta[çc][ãa]o|capeamento|reforma|amplia[çc][ãa]o|implanta[çc][ãa]o|drenagem|terraplanagem|recapeamento|urbaniza[çc][ãa]o|empreitada|requalifica[çc][ãa]o|\bponte(s)?\b|\bbueiro(s)?\b/i;
const CONSULTING_PT = /elabora[çc][ãa]o\s+d[eo]s?\s+projetos?|projetos?\s+(b[áa]sico|executivo|arquitet[ôo]nico|el[ée]trico)|levantamento(s)?\s+topogr[áa]fico|sondagen?s|ensaios?\s+geot[ée]cnico|consultoria|supervis[ãa]o\s+t[ée]cnica|plano\s+municipal|estudo(s)?\s+de\s+viabilidade/i;
const GOODS_PT = /aquisi[çc][ãa]o|fornecimento\s+de\s+(materiais|equipamentos|bens)|compra\s+de/i;

export function inferScopeType(text: string): TenderScopeType {
  if (WORKS_PT.test(text)) return "works";
  if (CONSULTING_PT.test(text)) return "consulting";
  if (GOODS_PT.test(text)) return "equipment";
  return "services";
}

/**
 * What state the procurement is in.
 *
 * `situacao_nome` values measured on real Concorrência rows: "Divulgada no
 * PNCP" (89), "Suspensa" (7), "Revogada" (4). The unfiltered sample showed
 * only the first two of those, which is why this list is written from the
 * modality-filtered one.
 *
 * SUSPENSA maps to `submission_closed`, and that is a compromise worth
 * stating. This project's TenderStatus has no suspended state. "open" would
 * tell a reader to prepare a bid for a procedure that is not currently
 * accepting one; "cancelled" would write off a procedure that routinely
 * resumes. `submission_closed` is the one that is true right now — it is not
 * taking bids — and a resumed tender flips back on the next import, because
 * the row is re-upserted whenever its situação changes. Adding a real
 * `suspended` status is the better fix and is deliberately not smuggled in
 * here.
 *
 * `tem_resultado` is reported honestly as awarded; lib/tender-status.ts's
 * rule 6 is what stops a wrong one from hiding a tender that is still taking
 * bids, so this mapper does not need to second-guess it.
 */
export function inferStatus(row: PncpSearchRow, now: Date = new Date()): TenderStatus {
  const situacao = (row.situacao_nome ?? "").toLowerCase();
  if (row.cancelado === true || /revogad|anulad/.test(situacao)) return "cancelled";
  if (/suspens/.test(situacao)) return "submission_closed";
  if (row.tem_resultado === true) return "awarded";
  const deadline = parsePncpDate(row.data_fim_vigencia);
  if (deadline && new Date(deadline).getTime() < now.getTime()) return "submission_closed";
  return "open";
}

/**
 * The tender's estimated value, in reais, summed across its items.
 *
 * Returns undefined — never 0 — when there is nothing to total. A sealed
 * estimate (`orcamentoSigiloso`, which Lei 14.133 permits) and an empty item
 * list both mean "no published amount", which this platform already treats as
 * "unknown", NOT as "worth nothing": see UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL
 * in lib/relevance.ts. Returning 0 would classify a sealed 50-million-real
 * highway as below the minimum threshold.
 */
export function sumPncpItemValues(items: PncpItem[] | undefined): { value?: number; sealedItems: number } {
  if (!items || items.length === 0) return { sealedItems: 0 };
  const sealedItems = items.filter((item) => item.orcamentoSigiloso === true).length;
  let total = 0;
  let sawNumber = false;
  for (const item of items) {
    const amount = typeof item.valorTotal === "number" ? item.valorTotal : undefined;
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
    sawNumber = true;
  }
  // Rounded to cents, because this is a sum of up to a few hundred floats
  // and the drift is real: the Elói Mendes education building (224 items)
  // totalled 2812092.0900000026 against a portal reading R$ 2.812.092,09.
  // Nothing downstream is wrong by that much, but the number is written to
  // Supabase and shown to a customer, and a tender amount ending in
  // 0900000026 reads as a data-quality fault whatever its true magnitude.
  return { ...(sawNumber ? { value: Math.round(total * 100) / 100 } : {}), sealedItems };
}

/**
 * `item_url` is the tuple, not the link.
 *
 * Real value: "/compras/57356434000146/2026/66" — the buyer's CNPJ, the year
 * and the sequential number, which is exactly what addresses the item list.
 * Returns null rather than throwing, since a row without it is unusable and
 * the caller should skip it, not crash a whole import.
 */
export function parsePncpItemUrl(itemUrl: string | undefined): { cnpj: string; ano: string; sequencial: string } | null {
  const match = (itemUrl ?? "").match(/\/compras\/(\d+)\/(\d{4})\/(\d+)/);
  if (!match) return null;
  return { cnpj: match[1], ano: match[2], sequencial: match[3] };
}

/**
 * Strips a relaying platform's own tag from the front of an object text.
 *
 * Real row, 2026-09-18: "[Portal de Compras Públicas] - CONTRATAÇÃO DE
 * EMPRESA ESPECIALIZADA PARA A EXECUÇÃO DE OBRA DE ENGENHARIA...". Municipal
 * entities publish through intermediaries (Portal de Compras Públicas,
 * Licitações-e, BLL) and some stamp their name into the description before it
 * reaches PNCP. It is not part of what is being bought, and `description`
 * becomes the reader-facing title.
 *
 * Deliberately NOT "strip any leading [...]": Brazilian titles use brackets
 * for real content, and "[LOTE 1] CONSTRUÇÃO DE..." would lose which lot the
 * tender is for. So both conditions must hold — the bracket carries no digit,
 * and a " - " separator follows it. A platform name has neither a lot number
 * nor a bare juxtaposition; a lot marker has both.
 *
 * One group only. A title beginning with two bracketed tags keeps the second,
 * which is the safe direction: showing one stray tag beats eating real text.
 */
export function stripRelayPlatformTag(text: string): string {
  return text.replace(/^\s*\[[^\]\d]{1,60}\]\s+[-–—]\s+/, "").trim();
}

/**
 * The reader-facing page for a tender.
 *
 * `item_url` from the search index is `/compras/{cnpj}/{ano}/{seq}` and that
 * is an API-side path, NOT a front-end route — pasting it into a browser
 * returns PNCP's 404 page (verified 2026-09-18, which is what a click is for;
 * the shape looked like a permalink and the path was simply wrong). The
 * portal serves a notice at `/app/editais/{cnpj}/{ano}/{seq}`: same three
 * components, different segment. Confirmed against a live page —
 * "Id contratação PNCP: 35842428000166-1-000008/2026" is served at
 * /app/editais/35842428000166/2026/8.
 *
 * `editais` rather than `compras` is also right for what this connector
 * queries: every row comes from `tipos_documento=edital`.
 *
 * Falls back to the notice listing rather than inventing a path, so an
 * unparseable row sends the reader somewhere real.
 */
/**
 * The dates PNCP publishes in the search row itself.
 *
 * Confirmed against a live notice page 2026-09-18, which labels the same pair
 * "Data de início de recebimento de propostas" and "Data fim de recebimento
 * de propostas", both marked horário de Brasília — the offset parsePncpDate
 * applies.
 *
 * Worth noting against Peru, where this connector's sibling gets nothing: a
 * SEACE cronograma is only on the ficha page, so submission deadlines there
 * are pasted in by hand through the admin cronograma form. PNCP puts both
 * ends of the proposal window in the feed, so Brazil needs no such step.
 *
 * `data_fim_vigencia` is mapped to `submission` rather than `opening`. In a
 * Concorrência the two are close but not the same event, and the deadline is
 * the one a bidder plans around; calling it an opening would misstate it by
 * whatever gap the entity leaves. No opening row is invented from it.
 *
 * `data_inicio_vigencia` — when proposal receipt OPENS — is deliberately not
 * stored, though the feed carries it. TenderKeyDate has no type for it: the
 * closest, `clarification`, renders to a reader as 「采购方召开的澄清会议」,
 * which is a different event entirely. Adding a correct type means touching
 * the union, the three label sets and the admin editor, and that is worth
 * doing on purpose rather than smuggling in behind a wrong label — a wrong
 * date on a tender page is worse than a missing one, because a reader acts
 * on it.
 */
function pncpKeyDates(row: PncpSearchRow, publicationDate: string): Tender["keyDates"] {
  const id = (row.numero_controle_pncp ?? "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const dates: Tender["keyDates"] = [{ id: `brazil-${id}-publication`, type: "publication", date: publicationDate }];
  const end = parsePncpDate(row.data_fim_vigencia);
  if (end) dates.push({ id: `brazil-${id}-submission`, type: "submission", date: end });
  return dates;
}

export function pncpPublicUrl(itemUrl: string | undefined): string {
  const parts = parsePncpItemUrl(itemUrl);
  if (!parts) return "https://pncp.gov.br/app/editais";
  return `https://pncp.gov.br/app/editais/${parts.cnpj}/${parts.ano}/${parts.sequencial}`;
}

export function mapPncpSearchRowToTender(row: PncpSearchRow, items: PncpItem[] | undefined, sourceName: string, now: Date = new Date()): Tender | null {
  // `description` is the object text; `title` is the notice number. Getting
  // these the wrong way round would fill the feed with "Edital nº 044/2026".
  const description = row.description ? stripRelayPlatformTag(row.description) : undefined;
  const tenderNumber = row.numero_controle_pncp?.trim();
  const buyer = row.orgao_nome?.trim() || row.unidade_nome?.trim();
  const publicationDate = parsePncpDate(row.data_publicacao_pncp);
  if (!description || !tenderNumber || !buyer || !publicationDate) return null;

  const { value: estimatedValue } = sumPncpItemValues(items);
  const governmentLevel = inferGovernmentLevel(row.esfera_id);
  const scopeType = inferScopeType(description);
  const procedureType = row.modalidade_licitacao_nome?.trim() || "Unknown";
  const location = row.municipio_nome && row.uf ? `${row.municipio_nome}/${row.uf}` : row.uf;

  const { industries, relevance } = classifyStoredTender({
    procedureType,
    tenderNumber,
    title: description,
    summary: description,
    buyer,
    country: "Brazil",
    governmentLevel,
    scopeType,
    estimatedValue,
    currency: estimatedValue === undefined ? undefined : "BRL",
    sourceName,
  });

  const nowIso = now.toISOString();
  const submissionDeadline = parsePncpDate(row.data_fim_vigencia);

  return {
    id: crypto.randomUUID(),
    // numero_controle_pncp is "<cnpj>-1-<sequencial>/<ano>" — globally unique
    // by construction, unlike the bare sequential number, which repeats for
    // every one of Brazil's thousands of buyers.
    slug: `brazil-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(description),
    summary: untranslated(description),
    buyer,
    country: "Brazil",
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(estimatedValue === undefined ? {} : { estimatedValue, currency: "BRL" }),
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(location ? { location } : {}),
    status: inferStatus(row, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: pncpKeyDates(row, publicationDate),
    risks: [],
    relevance,
    sourceName,
    // The row's own item_url, absolutised. PNCP's public notice page is a
    // client-side route, and no probe has yet clicked one of these to confirm
    // this exact path renders — worth one click before the first import
    // rather than a derived guess that 404s for every Brazilian tender.
    sourceUrl: pncpPublicUrl(row.item_url),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
