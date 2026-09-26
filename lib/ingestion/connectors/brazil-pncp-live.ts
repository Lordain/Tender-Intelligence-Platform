import { parsePncpItemUrl, type PncpItem, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";

/**
 * Live reads against Brazil's PNCP.
 *
 * The query shape here is not a design choice — it is the only shape that
 * survived four measurement runs on 2026-09-18 (full account in
 * lib/ingestion/README.md's Brazil section). Three of its rules are the
 * opposite of what you would write from the documentation, so they are
 * restated here where the code is:
 *
 *  1. **Two different hosts, and the good one is the search index.**
 *     `/api/search` is Elasticsearch (`"index": "catalog2"`), answers in
 *     under a second, and stayed up through two days in which
 *     `/api/consulta` — the relational service — returned 500, 502, 503,
 *     504 and 63-second responses. Discovery goes to the index. The amount
 *     is not in the index, and the compra record that holds it was MOVED to
 *     `/api/consulta` (that endpoint's own 301 says so), so the only
 *     reachable amount is the ITEM list, which was left behind on
 *     `/api/pncp` and answers in ~3.7s.
 *  2. **Exactly one of `q` / `status`, and `status` does nothing.** Sending
 *     both resets the connection. Sending neither is refused ("O filtro
 *     status é obrigatório"). Sending `status` narrows nothing — three
 *     mutually exclusive states each returned the whole 4.08-million-row
 *     index — so open-versus-closed is decided on our side from the row.
 *  3. **One modality per request.** `modalidades=4&modalidades=6` returns
 *     exactly what `modalidades=6` alone returns: the server keeps the last
 *     value and drops the first. Comma, semicolon and JSON-array spellings
 *     return zero rows. A multi-modality query therefore looks like it
 *     worked while silently halving the scope, which is why this module
 *     takes one id and the caller loops.
 *
 * And the one that shapes every retry: **ECONNRESET here is a throttle, not
 * a verdict.** The same request that resets now answers 200 a few seconds
 * later — proven when a parameter invented for a test was "rejected" while
 * four real ones were, and then all five behaved the other way round on the
 * next run. Recording a reset as an answer produced two wrong findings before
 * this was understood.
 */
const SEARCH_URL = "https://pncp.gov.br/api/search";
const ITEMS_BASE = "https://pncp.gov.br/api/pncp/v1/orgaos";

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  // Identify honestly rather than impersonate a browser — same posture as the
  // Peru connector, and for the same reason: a public open-data API should be
  // able to see who is calling and throttle us specifically if it wants to.
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Measured ceiling. 500 resets; 100 returns exactly 100. */
export const PNCP_MAX_PAGE_SIZE = 100;

/** Mandatory, and inert. Kept as a named constant so nobody later reads the literal as a working filter. */
const PNCP_REQUIRED_STATUS = "em_recebimento_de_proposta";

/**
 * Concorrência Eletrônica and Presencial — the two modalities that carry
 * Brazil's large public works under Lei 14.133, and the agreed initial scope
 * (user, 2026-09-18). Deliberately NOT Pregão Eletrônico (6): it is a million
 * rows of goods and services, and it is where a Portuguese exclusion ruleset
 * has to exist first. Dispensa (8) and Inexigibilidade (9) are 61% of the
 * index and are direct awards, which this platform excludes anyway — not
 * querying them is free.
 */
export const PNCP_WORKS_MODALITIES = [4, 5] as const;

// Extended 2026-09-18 after a 15-page sweep died on page 2: three tries
// spanning 19 seconds was not enough for a throttle that has previously
// cleared only after a minute or more. A reset on /api/search is PNCP
// declining to talk right now, never a statement about the request — the
// same URL that resets has come back 200 two hundred seconds later — so the
// only wrong response to one is to record it as an answer.
const RESET_BACKOFF_MS = [2_000, 5_000, 12_000, 30_000, 60_000];
const REQUEST_TIMEOUT_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type PncpFetchError = Error & { pncpStatus?: number | string };

/**
 * A network failure that is worth trying again, as opposed to a bad request.
 *
 * It used to check ECONNRESET and nothing else, which left the commonest
 * refusal unretried: Node reports a connect-level failure as a bare
 * `TypeError: fetch failed` whose real reason hides in `cause.code`, and that
 * fell through to `throw err` on the first attempt.
 *
 * Measured, 2026-09-21: probe run #15 got three of four PNCP queries answered;
 * run #16, ten minutes later from the same runner, got `fetch failed` on all
 * four. PNCP was throttling, not down — the single most retryable thing there
 * is, and the one case this function did not cover. Same lesson as
 * sisapinternet: one attempt cannot tell a dead origin from a momentary
 * refusal, and the two need opposite responses.
 *
 * A 400 or a 404 still does not come through here; those are our request.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export function isTransientNetwork(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string" && TRANSIENT_NETWORK_CODES.has(code)) return true;
    if (new RegExp([...TRANSIENT_NETWORK_CODES].join("|")).test(current.message)) return true;
    // Node's own wording for a connect-level failure, whose cause may be
    // absent entirely on some TLS errors.
    if (current.message === "fetch failed") return true;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

/** 5xx and 429 are transient on both PNCP hosts; a 400 or 404 is our request and retrying it only wastes time. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * A shorter budget for calls whose failure costs nothing.
 *
 * Added 2026-09-19 after a real run. The full chain above sleeps up to 109
 * seconds before giving up, which is the right trade for a search page —
 * losing one costs a slice of the import. It is the wrong trade for a
 * tender's attachment list: the tender is already written by then, so the
 * whole cost of failing is a missing link, while the cost of retrying is
 * paid by every one of a few hundred tenders in series. One retry, then move
 * on.
 */
const OPTIONAL_BACKOFF_MS = [2_000];

/**
 * The amount lookup's budget, and the correction to the paragraph above.
 *
 * That paragraph reasoned about the attachment pass and stopped there, so
 * `fetchPncpItems` kept the full 109-second chain. It should not have: an
 * amount is enrichment on a row that gets written either way, exactly like an
 * attachment link. The difference is only that an amount is worth more, which
 * argues for one extra retry — not for eleven.
 *
 * What the omission cost, measured on a real run (2026-09-19, 78 rows):
 * PNCP was refusing this client for the whole run, so every row walked the
 * whole chain and returned nothing. 78 x 109s / 4 workers = 35 minutes of
 * pure sleeping, inside a 43-minute run that resolved ZERO amounts. Two
 * retries cap the same worst case at about 2 minutes, and the streak breaker
 * in ingest-brazil.ts stops it long before that.
 */
const AMOUNT_BACKOFF_MS = [2_000, 6_000];

async function getJson(url: string, label: string, backoff: readonly number[] = RESET_BACKOFF_MS): Promise<unknown> {
  let lastError: PncpFetchError | undefined;
  for (let attempt = 0; attempt <= backoff.length; attempt += 1) {
    if (attempt > 0) await sleep(backoff[attempt - 1]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`${label}: PNCP responded ${response.status} — ${text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}`) as PncpFetchError;
        error.pncpStatus = response.status;
        if (!RETRYABLE_STATUSES.has(response.status)) throw error;
        lastError = error;
        continue;
      }
      // 204 and an empty body are how PNCP says "nothing matched" — a real
      // answer, not a failure, and the caller reads it as an empty page.
      if (response.status === 204 || text.trim() === "") return { items: [] };
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof Error && (err as PncpFetchError).pncpStatus !== undefined && !RETRYABLE_STATUSES.has((err as PncpFetchError).pncpStatus as number)) throw err;
      const aborted = err instanceof Error && err.name === "AbortError";
      if (!isTransientNetwork(err) && !aborted && !(err instanceof SyntaxError)) throw err;
      const error = new Error(`${label}: ${aborted ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s` : err instanceof SyntaxError ? "PNCP returned a body that is not JSON" : `PNCP 没有接受连接（${err instanceof Error ? err.message : String(err)}）`}`) as PncpFetchError;
      error.pncpStatus = aborted ? "timeout" : "network";
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`${label}: PNCP did not answer`);
}

export type PncpSearchPage = { items: PncpSearchRow[]; total: number | null };

/**
 * One procurement's CURRENT state, by its PNCP control number — what the
 * status refresh reads for tenders already stored (ingest-brazil.ts
 * refreshBrazilPncpStatuses). The search sweep cannot: it asks only for
 * notices still receiving proposals, so a suspended or revoked one simply
 * stops appearing in it.
 *
 * `/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}` — the pncp-api
 * path of the same resource answers 301 naming this one (checked 2026-09-26).
 * situacaoCompraId: 1 Divulgada no PNCP, 2 Revogada, 3 Anulada, 4 Suspensa.
 */
export type PncpCompraState = {
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  existeResultado?: boolean;
  dataEncerramentoProposta?: string;
};

const CONSULTA_BASE = "https://pncp.gov.br/api/consulta/v1/orgaos";

/** "<cnpj>-1-<sequencial>/<ano>" → its parts; undefined for anything else. */
export function parsePncpControlNumber(value: string): { cnpj: string; sequencial: number; ano: string } | undefined {
  const match = /^(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  return { cnpj: match[1], sequencial: Number(match[2]), ano: match[3] };
}

export async function fetchPncpCompra(controlNumber: string): Promise<PncpCompraState> {
  const parts = parsePncpControlNumber(controlNumber);
  if (!parts) throw new Error(`不是 PNCP 编号：${controlNumber}`);
  return (await getJson(`${CONSULTA_BASE}/${parts.cnpj}/compras/${parts.ano}/${parts.sequencial}`, `PNCP compra ${controlNumber}`)) as PncpCompraState;
}

/**
 * One page of notices for one modality, newest-UPDATED first.
 *
 * `ordenacao=-data` sorts on `data_atualizacao_pncp`, not publication —
 * measured across 100 rows, where update time was strictly descending and
 * publication time was not (a notice published 2026-04-07 sat at the top
 * because it had been touched that morning). So paging this is a walk
 * through "recently touched", and the caller stops at a watermark rather
 * than assuming the first page is the newest tenders.
 */
export async function fetchPncpSearchPage(modalidade: number, pagina: number, pageSize = PNCP_MAX_PAGE_SIZE): Promise<PncpSearchPage> {
  const size = Math.min(Math.max(pageSize, 10), PNCP_MAX_PAGE_SIZE);
  const url = `${SEARCH_URL}?tipos_documento=edital&status=${PNCP_REQUIRED_STATUS}&modalidades=${modalidade}&ordenacao=-data&pagina=${pagina}&tam_pagina=${size}`;
  const body = (await getJson(url, `PNCP search (modalidade ${modalidade}, page ${pagina})`)) as { items?: unknown; total?: unknown };
  return {
    items: Array.isArray(body.items) ? (body.items as PncpSearchRow[]) : [],
    total: typeof body.total === "number" ? body.total : null,
  };
}

/**
 * One page of free-text search results.
 *
 * Same endpoint, same retry budget and same headers as the modality sweep
 * above — the point is that a probe asking PNCP a question goes through the
 * connector rather than its own bare fetch(). The first version of
 * scripts/probe-pncp-overlap.ts had its own, with no retries at all, and
 * reported "4 条没问到" on a run where PNCP was merely throttling.
 *
 * Rows come back untyped on purpose: the search endpoint returns more fields
 * than PncpRow declares — `unidade_codigo` (the UASG) among them — and a
 * caller comparing identities needs the whole row, not the mapper's subset.
 */
export async function fetchPncpSearchByText(q: string, pageSize = 50): Promise<{ items: Record<string, unknown>[] }> {
  const size = Math.min(Math.max(pageSize, 10), PNCP_MAX_PAGE_SIZE);
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=${size}`;
  const body = (await getJson(url, `PNCP 全文检索「${q.slice(0, 40)}」`)) as { items?: unknown };
  return { items: Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [] };
}

/**
 * The item list that carries the money.
 *
 * Returns null — distinct from an empty array — when PNCP would not answer,
 * so the caller can tell "this procurement has no items" from "we could not
 * ask". That difference matters: the first is a tender with no published
 * amount, the second is one whose amount we should try again for later, and
 * conflating them would silently freeze a wrong tier onto a real tender.
 */
/**
 * Every line item of a procurement, paged.
 *
 * MEASURED 2026-09-18, and the reason this is no longer one request: a 3-day
 * sweep found 73 tenders returning exactly 10 items and none returning more.
 * `/itens` caps at 10 and says nothing about it — so a registro de preços
 * with 300 lines came back as its first 10, and `sumPncpItemValues` summed
 * them into a confident, wrong, much smaller number. With Brazil's floor at
 * $2,000,000 that lands the largest procurements under it, where they are
 * excluded and never written. A truncation that understates is the worst
 * failure shape available here, because nothing about it looks like an error.
 *
 * Two things this deliberately does NOT do:
 *
 * It does not trust `tamanhoPagina` to have been honoured. The page size is
 * requested, but the loop ends on a SHORT page rather than on a page smaller
 * than requested — so a server that silently keeps its own limit is walked
 * through correctly instead of being assumed to have obeyed.
 *
 * It does not assume `pagina` works either. If the parameter is ignored,
 * page 2 is page 1 again, and appending it would DOUBLE-count the amount —
 * turning an understatement into an overstatement, which is not an
 * improvement. So each page's first item is fingerprinted and a repeat ends
 * the walk, leaving the total merely incomplete, the way it already was.
 */
const ITEMS_PAGE_SIZE = 100;
const ITEMS_MAX_PAGES = 30;
const ITEMS_PAGE_PACE_MS = 300;
/**
 * Below this, a page is definitely the last one.
 *
 * It is the observed cap (10), not the requested size, on purpose: if PNCP
 * keeps its own limit the walk still terminates correctly, and if the cap
 * ever rises the only cost is one extra empty request per long tender. Erring
 * toward one wasted request beats erring toward a truncated sum.
 */
const ITEMS_MIN_FULL_PAGE = 10;

/**
 * @param onFailure receives the reason when the lookup could not be made at
 *   all. Without it a refusal and a genuinely empty item list are the same
 *   `null`, which is how a run once reported 78 tenders as "no amount (sealed
 *   budget etc.)" when the truth was that PNCP never answered once.
 */
export async function fetchPncpItems(
  itemUrl: string | undefined,
  onFailure?: (reason: string) => void,
): Promise<PncpItem[] | null> {
  const parts = parsePncpItemUrl(itemUrl);
  if (!parts) {
    onFailure?.(`item_url 解析不了：${itemUrl ?? "（空）"}`);
    return null;
  }
  const base = `${ITEMS_BASE}/${parts.cnpj}/compras/${parts.ano}/${parts.sequencial}/itens`;
  const label = `PNCP items (${parts.cnpj}/${parts.ano}/${parts.sequencial})`;

  const collected: PncpItem[] = [];
  const seenFirstItem = new Set<string>();
  let asked = false;

  for (let pagina = 1; pagina <= ITEMS_MAX_PAGES; pagina += 1) {
    if (pagina > 1) await sleep(ITEMS_PAGE_PACE_MS);
    let body: unknown;
    try {
      body = await getJson(`${base}?pagina=${pagina}&tamanhoPagina=${ITEMS_PAGE_SIZE}`, `${label} p${pagina}`, AMOUNT_BACKOFF_MS);
      asked = true;
    } catch (err) {
      if (collected.length === 0) onFailure?.(err instanceof Error ? err.message : String(err));
      // One tender's amount failing is not an import failing. Whatever was
      // already collected is still real — returning it beats discarding it,
      // and returning null on page 1 keeps "we could not ask" distinct from
      // "there are no items".
      return collected.length > 0 ? collected : null;
    }

    let page: PncpItem[] | null = null;
    if (Array.isArray(body)) page = body as PncpItem[];
    // The search index wraps rows in `items`; this endpoint returned a bare
    // array in every probe. Handle both rather than assume, but do not invent
    // a third shape — an unrecognised body is "could not ask", not "no items".
    else if (body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)) page = (body as { items: PncpItem[] }).items;
    if (page === null) {
      if (collected.length === 0) onFailure?.(`响应不是预期的数组结构（${label} p${pagina}）`);
      return collected.length > 0 ? collected : null;
    }
    if (page.length === 0) break;

    const first = page[0] as { numeroItem?: unknown } | undefined;
    const fingerprint = first?.numeroItem !== undefined ? String(first.numeroItem) : JSON.stringify(first).slice(0, 120);
    if (seenFirstItem.has(fingerprint)) break;
    seenFirstItem.add(fingerprint);

    collected.push(...page);
    if (page.length < ITEMS_MIN_FULL_PAGE) break;
  }

  return collected.length > 0 ? collected : asked ? [] : null;
}


/**
 * The official bid documents attached to one PNCP procurement.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * /admin/documents-needed offers a one-click batch download for any tender
 * that has rows in `tender_document_links`, and until now only Peru's OCDS
 * feed and PEMEX's SharePoint scrape wrote any. Every Brazilian tender
 * therefore showed up on that page with nothing to click, and the admin had
 * to open PNCP by hand for each one (user, 2026-09-19: 巴西待补文件增加标书
 * 下载按钮和相关功能（同秘鲁、Pemex）).
 *
 * ── Stated plainly: this shape is from PNCP's published API, NOT measured ──
 *
 * Every other rule in this file was written against four real measurement
 * runs. This one could not be: no `.gov.br` host is reachable from the
 * sandbox this was written in, so `/arquivos` has never answered here. The
 * parser is therefore written to accept what the documentation describes AND
 * the obvious variants, and to return null rather than guess when it gets
 * something else:
 *
 *  - the URL from `url`, `uri`, or rebuilt from the path when neither is
 *    present (the endpoint's own route is a valid download URL);
 *  - the name from `titulo`, `nomeArquivo` or `tipoDocumentoNome`, in that
 *    order, since a title is the most specific and a type name the most
 *    likely to exist;
 *  - `statusAtivo === false` rows dropped — PNCP keeps superseded documents
 *    listed, and downloading a withdrawn edital is worse than downloading
 *    nothing.
 *
 * The first real run is the measurement. `ingestBrazilPncp` reports the link
 * count precisely so that run says whether this reading was right, rather
 * than the count silently being zero.
 */
const ARQUIVOS_PAGE_SIZE = 50;

type PncpArquivo = {
  url?: unknown;
  uri?: unknown;
  titulo?: unknown;
  nomeArquivo?: unknown;
  tipoDocumentoNome?: unknown;
  sequencialDocumento?: unknown;
  dataPublicacaoPncp?: unknown;
  statusAtivo?: unknown;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Null means "could not ask"; an empty array means "asked, and there are none". */
export async function fetchPncpArquivos(
  itemUrl: string | undefined,
  /**
   * Why a null came back. Without it a run that asked 265 times and was
   * refused 265 times is indistinguishable from 265 tenders that genuinely
   * publish no attachments — and this endpoint's shape was written from
   * PNCP's documentation, never measured, so "refused" is the likelier of
   * the two and the one worth seeing.
   */
  onFailure?: (reason: string) => void,
): Promise<TenderDocumentLink[] | null> {
  const parts = parsePncpItemUrl(itemUrl);
  if (!parts) {
    onFailure?.("这条项目没有可解析的 PNCP 链接");
    return null;
  }
  const base = `${ITEMS_BASE}/${parts.cnpj}/compras/${parts.ano}/${parts.sequencial}/arquivos`;
  const label = `PNCP arquivos (${parts.cnpj}/${parts.ano}/${parts.sequencial})`;

  let body: unknown;
  try {
    body = await getJson(`${base}?pagina=1&tamanhoPagina=${ARQUIVOS_PAGE_SIZE}`, label, OPTIONAL_BACKOFF_MS);
  } catch (err) {
    // One tender's attachments failing is not an import failing — the tender
    // itself is already written by the time this runs.
    onFailure?.(err instanceof Error ? err.message : String(err));
    return null;
  }

  const rows: PncpArquivo[] | null = Array.isArray(body)
    ? (body as PncpArquivo[])
    : body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? ((body as { items: PncpArquivo[] }).items)
      : null;
  if (rows === null) {
    onFailure?.(`${label}: 应答不是文件列表的形状（${JSON.stringify(body).slice(0, 120)}）`);
    return null;
  }

  const links: TenderDocumentLink[] = [];
  for (const row of rows) {
    // A superseded document is still listed. Downloading a withdrawn edital
    // is worse than downloading nothing, so only an explicit false drops it —
    // a missing flag is not evidence of withdrawal.
    if (row.statusAtivo === false) continue;

    const sequencial = row.sequencialDocumento === undefined ? undefined : String(row.sequencialDocumento);
    const sourceUrl = str(row.url) ?? str(row.uri) ?? (sequencial ? `${base}/${sequencial}` : undefined);
    if (!sourceUrl) continue;

    const name = str(row.titulo) ?? str(row.nomeArquivo) ?? str(row.tipoDocumentoNome) ?? `documento-${sequencial ?? links.length + 1}`;
    links.push({
      sourceUrl,
      fileName: safeFileName(name),
      documentType: str(row.tipoDocumentoNome),
      // The name usually carries the extension; the API does not publish a
      // separate format field, and inventing "pdf" would be a guess that the
      // download route would then act on.
      format: /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase(),
      publishedAt: str(row.dataPublicacaoPncp),
    });
  }
  return links;
}
