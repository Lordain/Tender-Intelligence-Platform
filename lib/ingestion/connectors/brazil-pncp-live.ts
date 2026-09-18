import { parsePncpItemUrl, type PncpItem, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";

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

function isReset(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if ((current as NodeJS.ErrnoException).code === "ECONNRESET") return true;
    if (/ECONNRESET/.test(current.message)) return true;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

/** 5xx and 429 are transient on both PNCP hosts; a 400 or 404 is our request and retrying it only wastes time. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function getJson(url: string, label: string): Promise<unknown> {
  let lastError: PncpFetchError | undefined;
  for (let attempt = 0; attempt <= RESET_BACKOFF_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RESET_BACKOFF_MS[attempt - 1]);
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
      if (!isReset(err) && !aborted && !(err instanceof SyntaxError)) throw err;
      const error = new Error(`${label}: ${aborted ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s` : err instanceof SyntaxError ? "PNCP returned a body that is not JSON" : "PNCP reset the connection"}`) as PncpFetchError;
      error.pncpStatus = aborted ? "timeout" : "ECONNRESET";
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`${label}: PNCP did not answer`);
}

export type PncpSearchPage = { items: PncpSearchRow[]; total: number | null };

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
 * The item list that carries the money.
 *
 * Returns null — distinct from an empty array — when PNCP would not answer,
 * so the caller can tell "this procurement has no items" from "we could not
 * ask". That difference matters: the first is a tender with no published
 * amount, the second is one whose amount we should try again for later, and
 * conflating them would silently freeze a wrong tier onto a real tender.
 */
export async function fetchPncpItems(itemUrl: string | undefined): Promise<PncpItem[] | null> {
  const parts = parsePncpItemUrl(itemUrl);
  if (!parts) return null;
  try {
    const body = await getJson(`${ITEMS_BASE}/${parts.cnpj}/compras/${parts.ano}/${parts.sequencial}/itens`, `PNCP items (${parts.cnpj}/${parts.ano}/${parts.sequencial})`);
    if (Array.isArray(body)) return body as PncpItem[];
    // The search index wraps rows in `items`; this endpoint returned a bare
    // array in every probe. Handle both rather than assume, but do not invent
    // a third shape — an unrecognised body is "could not ask", not "no items".
    if (body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)) return (body as { items: PncpItem[] }).items;
    return null;
  } catch {
    // One tender's amount failing is not an import failing. /api/pncp has been
    // the reliable host, but it sits on the same infrastructure as the one
    // that has been down all week.
    return null;
  }
}
