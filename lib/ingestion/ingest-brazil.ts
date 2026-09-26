import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPncpArquivos, fetchPncpCompra, fetchPncpItems, fetchPncpSearchPage, PNCP_MAX_PAGE_SIZE, PNCP_WORKS_MODALITIES, type PncpCompraState } from "@/lib/ingestion/connectors/brazil-pncp-live";
import { refreshStoredStatuses, type ObservedStatus, type StatusRefreshResult } from "@/lib/ingestion/status-refresh";
import { saveDocumentLinks, type DocumentLinksForSlug } from "@/lib/ingestion/document-links";
import { mapPncpSearchRowToTender, parsePncpDate, type PncpItem, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";
import { filterRecentTenders } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender, TenderStatus } from "@/types/tender";
import { REVIEW_CSV_HEADERS, reviewCsvRow, toCsv, writeReviewCsv } from "./review-csv";
import { convertToUsd } from "@/lib/currency";

export const BRAZIL_PNCP_SOURCE_NAME = "Portal Nacional de Contratações Públicas (PNCP) — busca de editais";

/**
 * Brazil's import, as the four measurement runs on 2026-09-18 said it has to
 * be shaped (full account in lib/ingestion/README.md).
 *
 * Discovery and money come from two different hosts, because PNCP split them
 * and only broke one: `/api/search` is an Elasticsearch index that answers in
 * under a second, while `/api/consulta` — which holds the compra record —
 * spent two days returning 500s, 502s, 503s, 504s and 63-second responses.
 * The amount survives only because the item list was left behind on
 * `/api/pncp` when the record was moved off it.
 *
 * Three consequences shape the loop below:
 *
 *  1. **One modality per pass.** `modalidades` keeps only the last value when
 *     repeated, so a combined query returns half the scope while looking like
 *     it worked.
 *  2. **No date bound exists.** Nothing server-side narrows by publication or
 *     update date — five parameter names were tried and silently ignored. So
 *     the sweep walks `ordenacao=-data` (which is UPDATE time, not
 *     publication) and stops when it has gone far enough back, and recency is
 *     enforced on our side afterwards.
 *  3. **Amounts cost one request each, and may simply not come.** A tender
 *     whose items cannot be fetched keeps no value rather than a zero — see
 *     sumPncpItemValues. That is a normal outcome to retry another day, not
 *     an import failure.
 */
export type BrazilIngestResult = {
  fetchedRows: number;
  mappedCount: number;
  keptCount: number;
  excludedCount: number;
  /** Rows whose amount could not be resolved — no items published, a sealed estimate, or PNCP not answering. Reported because a Brazilian tender with no amount cannot be tiered on value. */
  withoutAmount: number;
  /** How many of those were a sealed estimate (orcamentoSigiloso) rather than a failed lookup. The first is lawful and permanent; the second is worth retrying. */
  sealedBudget: number;
  /** Rows that arrived already awarded with the proposal deadline behind them. Dropped: PNCP's `tem_resultado` is a boolean with no winner, amount or date behind it, so the row can neither be bid on nor read as award intelligence. */
  skippedAwardedClosed: number;
  /** How many amount lookups PNCP refused outright. Distinct from sealedBudget and from "this tender has no items": a refusal is a fact about the network, not about the tender, and re-running fixes it. */
  amountLookupFailed: number;
  /** Set when the amount pass stopped on AMOUNT_FAILURE_STREAK. Every row after the stop has no amount for a reason that has nothing to do with the row. */
  amountsStoppedEarly: boolean;
  /** The distinct refusal reasons, commonest first. Printed verbatim because guessing at PNCP's mood from a count is how the 43-minute run got mistaken for sealed budgets. */
  amountFailureReasons: string[];
  /**
   * Every distinct exclusion reason with its count, commonest first.
   *
   * Reported because the total alone cannot answer the only question that
   * matters on a new source: a row dropped for being under US$800k is the
   * rule working, and a row dropped on a Portuguese keyword is a rule nobody
   * has checked yet. Those two have looked identical in a summary line twice
   * before (see upsert-tenders.ts on the COP 380bn port programme lost to the
   * word "mantenimiento"), and an excluded row is never written, so a wrong
   * call here is permanent and silent.
   */
  excludedByReason: { reason: string; count: number }[];
  /**
   * The attachment pass, when it ran. Reported in full rather than as a
   * boolean because this is the FIRST measurement of PNCP's /arquivos shape —
   * it was written from the published API, not from a real response, since no
   * .gov.br host is reachable from where it was written. `tendersAsked` with
   * `linkCount: 0` is the signal that the reading is wrong; without both
   * numbers a silent zero would look like "these tenders have no documents".
   */
  documentLinks?: {
    tendersAsked: number;
    tendersWithLinks: number;
    linkCount: number;
    failed: number;
    /** True when the failure streak tripped and the rest were never asked. */
    stoppedEarly: boolean;
    /** The first few refusals, verbatim, so a run of zeros says why. */
    failureReasons: string[];
  };
  /**
   * The largest `/itens` list seen, and how many tenders returned exactly that
   * many.
   *
   * `/itens` is requested with no paging parameters, so if PNCP caps the
   * response the amount is UNDERSTATED rather than failed — the one failure
   * shape that cannot announce itself. A cap shows as a pile of tenders
   * returning exactly the same round count; genuinely varied counts with an
   * odd maximum mean no cap. Costs nothing: these lists are already in hand.
   *
   * It matters more since the floor became $2,000,000. An understated
   * registro de preços drops below it and is silently excluded, and excluded
   * rows are never written.
   */
  maxItemsSeen: number;
  tendersAtMaxItems: number;
  /**
   * The kept rows by tier, and by USD band within the value rules.
   *
   * "118 条进入推荐" cannot be acted on: it does not say whether that is a
   * handful of large projects or a wall of contracts sitting just over the
   * floor. The bands are cut at the thresholds themselves, so the answer to
   * "what if the minimum were higher" can be read straight off the table
   * instead of being guessed or re-run.
   */
  keptByTier: { tier: string; count: number }[];
  keptByValueBand: { band: string; count: number }[];
  /** Where the full excluded list was written for review. Produced on a DRY RUN too — the run that is supposed to be inspected before anything is written is exactly the one that needs it. */
  excludedCsvPath?: string;
  /**
   * Per modality, and `stoppedBy` is the point of it.
   *
   * "window" means the sweep ran until PNCP's own rows fell out of the date
   * window — everything published in it was seen. "cap" means maxRowsPerModality
   * stopped it first, so the run covered an unknown fraction and the total is a
   * floor, not a count. Those two were indistinguishable before, which made
   * "发布时间窗：2 个月" a claim the run could not support.
   */
  byModality: { modalidade: number; rows: number; pages: number; stoppedBy: "window" | "cap" | "end" | "error" }[];
  written?: number;
  failed?: number;
  write: boolean;
};

export type BrazilIngestOptions = {
  write: boolean;
  /** Keep tenders published within this many months. Defaults to 2, matching the other live connectors. Ignored when `days` is set. */
  months?: number;
  /**
   * Keep tenders published within this many DAYS, overriding `months`.
   *
   * The reason this exists rather than a fractional month: with the
   * window-exhaustion stop condition below, a short window is what makes a
   * sweep both small AND complete — it ends because PNCP ran out of rows in
   * the period, not because a row cap cut it off. A daily 3-day run therefore
   * covers everything published, at a fraction of the requests, which a
   * 2-month run can only do by paging for an hour.
   */
  days?: number;
  /** Stop paging a modality once this many rows have been seen. The index is ~4.08M rows and has no date filter, so a sweep without a stop condition never ends. */
  maxRowsPerModality?: number;
  /** Which modality ids to sweep. Defaults to Concorrência Eletrônica + Presencial — the agreed initial scope. */
  modalities?: readonly number[];
  /** Skip the per-tender amount lookup. Halves the request count for a shape-only dry run; every row then reports no amount, which is NOT how they should be judged. */
  skipAmounts?: boolean;
  /**
   * After the upsert, ask PNCP for each written tender's attached documents
   * and record their URLs in `tender_document_links`.
   *
   * Off by default and a separate pass on purpose, the same shape Colombia's
   * import uses: it is one extra request per WRITTEN tender, it only makes
   * sense on a write run (there is no tender to attach links to otherwise),
   * and a failure here must not cost the import. See fetchPncpArquivos.
   */
  downloadDocuments?: boolean;
};

/** PNCP throttles by resetting connections. The connector retries, but pacing means it has less to retry. */
const PACE_MS = 1_200;
/** Shared minimum gap between amount-request STARTS — see the worker pool below for why it is shared rather than per-worker. */
const AMOUNT_PACE_MS = 500;
/**
 * How many attachment lookups may fail in a row before the pass gives up.
 *
 * Ten is enough to rule out a handful of tenders that genuinely have no
 * document page, and small enough that a dead endpoint costs seconds rather
 * than the half hour it cost once.
 */
const DOCUMENT_FAILURE_STREAK = 10;
/**
 * How many amount lookups may fail in a row before the pass gives up.
 *
 * Added 2026-09-19, and it is the same lesson as DOCUMENT_FAILURE_STREAK one
 * pass earlier — which is the point worth recording. That breaker was written
 * because a dead endpoint cost half an hour, and the amount pass, sitting
 * directly above it with the identical failure mode, was left without one. A
 * run then spent 43 minutes resolving zero amounts, and nothing stopped it.
 *
 * Twelve rather than ten only because an amount is worth more than an
 * attachment link: a handful of tenders genuinely publish no items, and the
 * breaker must not fire on those. Twelve consecutive failures is not a
 * coincidence of empty tenders — it is PNCP refusing this client.
 */
const AMOUNT_FAILURE_STREAK = 12;
/** Row-count and wall-clock triggers for the amount pass's progress line. */
const AMOUNT_PROGRESS_EVERY = 10;
const AMOUNT_HEARTBEAT_MS = 10_000;
const AMOUNT_CONCURRENCY = 4;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rows are keyed by `numero_controle_pncp`, which is the same key the slug is
 * built from. A sweep can see the same notice twice — the index is written to
 * while we page it, and a row updated between page 3 and page 4 moves under
 * us — and two rows sharing a slug in one upsert statement is exactly the
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" error the
 * Colombian import hit.
 */
function dedupeRows(rows: PncpSearchRow[]): PncpSearchRow[] {
  const newest = new Map<string, PncpSearchRow>();
  for (const row of rows) {
    const key = row.numero_controle_pncp?.trim();
    if (!key) continue;
    const existing = newest.get(key);
    if (!existing) {
      newest.set(key, row);
      continue;
    }
    const a = parsePncpDate(row.data_atualizacao_pncp) ?? "";
    const b = parsePncpDate(existing.data_atualizacao_pncp) ?? "";
    if (a > b) newest.set(key, row);
  }
  return [...newest.values()];
}

export async function ingestBrazilPncp(
  supabase: SupabaseClient | null,
  options: BrazilIngestOptions,
  onProgress?: (message: string) => void,
): Promise<BrazilIngestResult> {
  const months = options.months ?? 2;
  const days = options.days;
  // 3000, raised from 600, because --max changed jobs. It used to be the ONLY
  // thing that ended a sweep, so a low value was the safe one; now the window
  // condition ends it and this is purely a runaway guard. Measured 2026-09-18:
  // a 3-day window took 14 pages (1400 rows) for modality 4 and 1 page for
  // modality 5, both stopping on the window. A cap below that silently
  // truncates the period — which is the failure this number now exists to
  // avoid, not to cause.
  const maxRows = options.maxRowsPerModality ?? 3000;
  const modalities = options.modalities ?? PNCP_WORKS_MODALITIES;

  const rows: PncpSearchRow[] = [];
  const byModality: BrazilIngestResult["byModality"] = [];

  // The stop condition, and why it is sound.
  //
  // `ordenacao=-data` was measured to sort strictly descending on
  // data_atualizacao_pncp (NOT publication — see this file's header). A record
  // cannot be updated before it is published, so data_atualizacao >=
  // data_publicacao for every row. Therefore once a page's LAST row was
  // updated before the publication cutoff, no later page can hold anything
  // published inside the window: every one of them was updated even earlier,
  // and published earlier still.
  //
  // That makes "we have all of the last N months" provable, which a fixed row
  // cap never could. maxRowsPerModality stays as a safety stop for a sweep
  // that would otherwise run for hours, and `stoppedBy` reports which one
  // fired — because a run stopped by the cap has NOT covered the window, and
  // saying so is the difference between a count and a floor.
  const windowCutoff = new Date();
  if (days !== undefined) windowCutoff.setDate(windowCutoff.getDate() - days);
  else windowCutoff.setMonth(windowCutoff.getMonth() - months);
  const windowLabel = days !== undefined ? `${days} 天` : `${months} 个月`;

  for (const modalidade of modalities) {
    let pages = 0;
    let seen = 0;
    let stoppedBy: "window" | "cap" | "end" | "error" = "cap";
    for (let pagina = 1; seen < maxRows; pagina += 1) {
      if (pagina > 1) await sleep(PACE_MS);
      // A failed page ends THIS modality and keeps what came before it.
      // Previously the error propagated out and the whole run died — a sweep
      // that got 14 of 15 pages threw all 14 away, and one that died on page 2
      // threw away page 1. PNCP resets are a throttle, so a later page failing
      // says nothing about the rows already in hand.
      //
      // It is recorded as its own stop reason rather than folded into "cap",
      // because the two are not equally bad: a cap means the period was not
      // covered, an error means it was not covered AND something is wrong.
      let page: Awaited<ReturnType<typeof fetchPncpSearchPage>>;
      try {
        page = await fetchPncpSearchPage(modalidade, pagina, PNCP_MAX_PAGE_SIZE);
      } catch (err) {
        stoppedBy = "error";
        onProgress?.(`采购方式 ${modalidade}：第 ${pagina} 页取不到（${err instanceof Error ? err.message : String(err)}），保留已取到的 ${seen} 条`);
        break;
      }
      pages += 1;
      if (page.items.length === 0) {
        stoppedBy = "end";
        break;
      }
      rows.push(...page.items);
      seen += page.items.length;
      onProgress?.(`采购方式 ${modalidade}：第 ${pagina} 页 ${page.items.length} 条（累计 ${seen}${page.total !== null ? ` / 索引共 ${page.total}` : ""}）`);
      if (page.items.length < PNCP_MAX_PAGE_SIZE) {
        stoppedBy = "end";
        break;
      }
      const oldestUpdate = parsePncpDate(page.items[page.items.length - 1]?.data_atualizacao_pncp);
      if (oldestUpdate !== undefined && new Date(oldestUpdate).getTime() < windowCutoff.getTime()) {
        stoppedBy = "window";
        onProgress?.(`采购方式 ${modalidade}：已翻到 ${windowLabel}之前，窗口取完了`);
        break;
      }
    }
    byModality.push({ modalidade, rows: seen, pages, stoppedBy });
  }

  const unique = dedupeRows(rows);
  if (unique.length !== rows.length) onProgress?.(`去重：${rows.length} → ${unique.length} 条（翻页期间索引在写入，同一条会出现两次）`);

  // Recency is decided on the search row, BEFORE the amount lookup. Each
  // lookup is a request against infrastructure that has been unreliable all
  // week, and spending one on a tender that the months filter will drop
  // anyway is the easiest request not to send.
  const recentRows = unique.filter((row) => {
    const published = parsePncpDate(row.data_publicacao_pncp);
    if (!published) return false;
    // windowCutoff, not a second one computed here: this filter and the
    // paging stop condition must be the same instant, or a `days` run would
    // page correctly and then filter by months.
    return new Date(published).getTime() >= windowCutoff.getTime();
  });
  onProgress?.(`发布时间在 ${windowLabel}内的：${recentRows.length} / ${unique.length} 条`);

  // Rows that arrive ALREADY AWARDED with their proposal deadline behind
  // them, dropped here (2026-09-19, after the user found three of them in
  // 项目管理 — 已中标, 常规项目, no value, and 交标 dates of 2025-10-02,
  // 2026-03-18 and 2026-08-26 against a publication date of 2026-09-18).
  //
  // How they got in. upsertTendersBatched refuses to write any tender whose
  // deadline has passed, from any source — except that isPastSubmissionDeadline
  // exempts `status === "awarded"`, so award intelligence survives the gate.
  // That exemption is right, and it is not what happened here.
  //
  // For Brazil the exemption admits rows carrying NO award intelligence at
  // all. `tem_resultado` is a boolean: it says a result exists and not one
  // fact about it. This mapper reads no winner, no awarded amount, no award
  // date — there is nowhere in the search row to read them from. So the row
  // reaches a reader as "已中标, no value, deadline last October": it cannot
  // be bid on, and it says nothing about who won or for how much. Neither
  // audience this platform has is served by it.
  //
  // Deliberately narrow. A result published while the proposal window is
  // still open is kept (unusual, but it is real and a reader can still act).
  // A row with no parseable deadline is kept, because "we cannot tell" is not
  // "it is stale". And this is a Brazil-local rule, not a change to
  // isPastSubmissionDeadline: Ecopetrol, CompraNet and the Compras MX
  // contract feeds exist precisely to carry award results, and widening the
  // platform gate on the strength of one source's shape is how a fix for one
  // connector silently empties three others.
  const nowMs = Date.now();
  const staleAwarded = recentRows.filter((row) => {
    if (row.tem_resultado !== true) return false;
    const deadline = parsePncpDate(row.data_fim_vigencia);
    return deadline !== null && deadline !== undefined && new Date(deadline).getTime() < nowMs;
  });
  const withinWindow = recentRows.filter((row) => !staleAwarded.includes(row));
  if (staleAwarded.length > 0) {
    onProgress?.(
      `跳过 ${staleAwarded.length} 条「已中标且投标截止日期已过」的记录 —— ` +
        "PNCP 只给了一个「有结果」的布尔值，没有中标方、没有中标金额，投标投不了、情报也读不到",
    );
  }

  // Amounts are one request per tender and the slowest part of the run by a
  // wide margin — 804 of them at the old one-at-a-time 1,200ms pace is 16
  // minutes of a 17-minute run.
  //
  // Strictly sequential was the right shape while PNCP's limits were unknown:
  // an early sweep tripped its rate limiter at 14 requests in ~5 seconds and
  // took 429s, so ~2.8 req/s is roughly where it objects. That measurement is
  // also what says 0.83 req/s leaves most of the budget unused.
  //
  // So: a fixed number of workers pulling from one queue, with a SHARED pace
  // between request starts rather than a per-worker sleep. The shared clock is
  // the point — per-worker pacing multiplies by the worker count and would
  // walk straight into the limiter as concurrency rose. 500ms gives 2 req/s,
  // below the observed objection point, and four workers keep that rate
  // sustained while individual requests take seconds.
  //
  // getJson already retries 429 with backoff, so being slightly wrong here
  // costs time rather than data.
  const results = new Array<Tender | null>(withinWindow.length).fill(null);
  const sealedFlags = new Array<boolean>(withinWindow.length).fill(false);
  let withoutAmount = 0;
  let sealedBudget = 0;

  const itemCounts: number[] = [];
  let nextSlotAt = 0;
  async function takeSlot() {
    const now = Date.now();
    const at = Math.max(now, nextSlotAt);
    nextSlotAt = at + AMOUNT_PACE_MS;
    if (at > now) await sleep(at - now);
  }

  let cursor = 0;
  let done = 0;
  // Counted across workers on purpose. Four workers each failing three times
  // in a row is the same fact as one worker failing twelve times — the host is
  // refusing us — and a per-worker counter would need four times the evidence
  // to notice it.
  let amountFailureStreak = 0;
  let amountLookupFailed = 0;
  let amountsStoppedEarly = false;
  const amountFailureReasons = new Set<string>();
  // Every 50 rows was the only trigger until 2026-09-19, when a 97-row run
  // printed 「发布时间在 1 天内的：97 / 300 条」 and then said nothing for long
  // enough that the user asked whether it had hung. It had not — the first
  // progress line simply was not due until row 50. Two triggers now, because
  // they answer different questions: the count says how far along it is, and
  // the clock says it is still alive. A run being throttled by PNCP is slow,
  // not stuck, and only a heartbeat can tell a reader which one they have.
  let lastBeatAt = Date.now();
  function beat(force: boolean) {
    const now = Date.now();
    if (!force && done % AMOUNT_PROGRESS_EVERY !== 0 && now - lastBeatAt < AMOUNT_HEARTBEAT_MS) return;
    lastBeatAt = now;
    const elapsed = Math.round((now - startedAmountsAt) / 1000);
    onProgress?.(`取金额：${done} / ${withinWindow.length}（已用 ${elapsed}s）`);
  }
  const startedAmountsAt = Date.now();
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= withinWindow.length) return;
      const row = withinWindow[index];
      let items: PncpItem[] | null = null;
      if (!options.skipAmounts && !amountsStoppedEarly) {
        await takeSlot();
        let refused: string | null = null;
        items = await fetchPncpItems(row.item_url, (reason) => {
          refused = reason;
        });
        if (refused !== null) {
          amountLookupFailed += 1;
          amountFailureStreak += 1;
          amountFailureReasons.add(refused);
        } else {
          amountFailureStreak = 0;
        }
        done += 1;
        beat(done === withinWindow.length);
        if (amountFailureStreak >= AMOUNT_FAILURE_STREAK) {
          amountsStoppedEarly = true;
          onProgress?.(
            `取金额：连续 ${amountFailureStreak} 条都被拒，停在第 ${done} / ${withinWindow.length} 条 —— ` +
              "项目照常写入，只是没有金额。这是 PNCP 在拒绝我们，不是这些项目没有预算，过几分钟重跑就会补上",
          );
        }
      }
      const tender = mapPncpSearchRowToTender(row, items ?? undefined, BRAZIL_PNCP_SOURCE_NAME);
      if (!tender) continue;
      results[index] = tender;
      sealedFlags[index] = items?.some((item) => item.orcamentoSigiloso === true) === true;
      if (items) itemCounts.push(items.length);
    }
  }

  await Promise.all(
    Array.from({ length: options.skipAmounts ? 1 : AMOUNT_CONCURRENCY }, () => worker()),
  );

  // Rebuilt in the original order rather than in completion order, so two runs
  // over the same rows produce the same list and a diff between them means
  // something.
  const mapped: Tender[] = [];
  // Slug -> the row's item_url. /arquivos hangs off the same cnpj/ano/
  // sequencial triple that item_url carries, and by the time the attachment
  // pass runs the only handle left on a tender is its slug.
  const itemUrlBySlug = new Map<string, string>();
  for (const [index, tender] of results.entries()) {
    if (tender === null) continue;
    if (tender.estimatedValue === undefined) {
      withoutAmount += 1;
      if (sealedFlags[index]) sealedBudget += 1;
    }
    const itemUrl = withinWindow[index]?.item_url;
    if (itemUrl) itemUrlBySlug.set(tender.slug, itemUrl);
    mapped.push(tender);
  }

  // A second recency pass on the mapped rows, so this connector obeys the
  // same filterRecentTenders() the others do rather than only its own
  // pre-filter above — the two agree, and the shared one is what the rest of
  // this codebase's behaviour is defined against.
  // Still months: filterRecentTenders is the codebase-wide recency guarantee
  // every connector passes through, and a `days` window is a strict subset of
  // it, so this cannot re-admit anything the cutoff above rejected.
  const kept = filterRecentTenders(mapped, months);
  const excluded = kept.filter((tender) => tender.relevance.tier === "excluded");
  const excludedCount = excluded.length;

  const reasonCounts = new Map<string, number>();
  for (const tender of excluded) {
    const reason = tender.relevance.reason?.zh ?? "(无理由)";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const keptTenders = kept.filter((tender) => tender.relevance.tier !== "excluded");
  const tierCounts = new Map<string, number>();
  for (const tender of keptTenders) tierCounts.set(tender.relevance.tier, (tierCounts.get(tender.relevance.tier) ?? 0) + 1);

  // Bands cut at MIN/SIGNIFICANT/FLAGSHIP, because those are the numbers a
  // decision about "too many" would actually move. Converted with the same
  // lib/currency.ts rate the classifier used, so the bands and the tiers
  // cannot disagree.
  const BANDS: { band: string; min: number; max?: number }[] = [
    { band: "200 万 – 500 万美元（常规）", min: 2_000_000, max: 5_000_000 },
    { band: "500 万 – 1000 万美元（中型）", min: 5_000_000, max: 10_000_000 },
    { band: "1000 万美元以上（大型）", min: 10_000_000 },
  ];
  const bandCounts = new Map<string, number>();
  let keptWithoutValue = 0;
  for (const tender of keptTenders) {
    const usd = tender.estimatedValue === undefined ? null : convertToUsd(tender.estimatedValue, tender.currency);
    if (usd === null) {
      keptWithoutValue += 1;
      continue;
    }
    const band = BANDS.find((b) => usd >= b.min && (b.max === undefined || usd < b.max));
    if (band) bandCounts.set(band.band, (bandCounts.get(band.band) ?? 0) + 1);
  }

  const maxItemsSeen = itemCounts.length === 0 ? 0 : Math.max(...itemCounts);
  const tendersAtMaxItems = itemCounts.filter((n) => n === maxItemsSeen).length;

  const result: BrazilIngestResult = {
    maxItemsSeen,
    tendersAtMaxItems,
    fetchedRows: rows.length,
    mappedCount: mapped.length,
    keptByTier: [...tierCounts.entries()].map(([tier, count]) => ({ tier, count })).sort((a, b) => b.count - a.count),
    keptByValueBand: [
      ...BANDS.filter((b) => bandCounts.has(b.band)).map((b) => ({ band: b.band, count: bandCounts.get(b.band) as number })),
      // The label used to read 「无金额（法定保密等）」 unconditionally, which
      // told a reader that 62 Brazilian tenders had lawfully sealed budgets on
      // a run where the real answer was that PNCP never answered once. A
      // refusal and a sealed estimate are opposite facts: one is permanent and
      // means the value will never be known, the other is this afternoon's
      // network and is fixed by re-running.
      ...(keptWithoutValue > 0
        ? [{ band: amountLookupFailed > sealedBudget ? "无金额（多数是没取到，不是保密）" : "无金额（法定保密等）", count: keptWithoutValue }]
        : []),
    ],
    keptCount: kept.length - excludedCount,
    excludedCount,
    excludedByReason: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    withoutAmount,
    sealedBudget,
    skippedAwardedClosed: staleAwarded.length,
    amountLookupFailed,
    amountsStoppedEarly,
    amountFailureReasons: [...amountFailureReasons],
    byModality,
    write: options.write,
  };

  // The write path gets this CSV from upsertTendersBatched. A dry run never
  // reaches that line, which left the one run whose whole purpose is review
  // as the only one with nothing to review — so it is written here instead,
  // through the same helpers, so both runs produce the same file.
  if (!options.write) {
    if (excluded.length === 0) return result;
    const path = writeReviewCsv({
      dir: "exports",
      baseName: `excluded-brazil-pncp-dryrun-${new Date().toISOString().slice(0, 10)}`,
      csv: toCsv(REVIEW_CSV_HEADERS, excluded.map(reviewCsvRow)),
      label: "ingest-brazil",
      failureNote: "干跑本身不受影响",
    });
    return { ...result, excludedCsvPath: path ?? undefined };
  }
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const written = await upsertTendersBatched(supabase, kept);
  const writeResult = { ...result, written: written.upsertedCount, failed: written.failed.length };
  if (!options.downloadDocuments) return writeResult;

  // Attachments, after the write: a link row needs a tender_id, and
  // saveDocumentLinks resolves it by slug. Paced through the same slot
  // limiter the amount pass uses — this is the same host, and hammering it
  // is what gets connections reset.
  const candidates = kept.filter((tender) => itemUrlBySlug.has(tender.slug));
  const entries: DocumentLinksForSlug[] = [];
  let linkFailures = 0;
  let consecutiveFailures = 0;
  let stoppedEarly = false;
  const failureReasons: string[] = [];
  let asked = 0;
  for (const [index, tender] of candidates.entries()) {
    await takeSlot();
    asked += 1;
    const links = await fetchPncpArquivos(itemUrlBySlug.get(tender.slug), (reason) => {
      if (failureReasons.length < 3) failureReasons.push(reason);
    });
    // null is "could not ask" and [] is "asked, none published". Only the
    // first is a failure, and conflating them would report every
    // document-less tender as a broken request.
    if (links === null) {
      linkFailures += 1;
      consecutiveFailures += 1;
    } else {
      consecutiveFailures = 0;
      if (links.length > 0) entries.push({ slug: tender.slug, links });
    }
    // Added 2026-09-19 after a real run sat in this loop past thirty minutes.
    // This endpoint's shape was written from PNCP's published API and has
    // never been measured, so the case where it simply does not answer is
    // live — and in that case every remaining tender costs its pacing slot
    // and a round trip to learn the same thing the first ten already said.
    // Attachments are optional; the tenders are already written. Stopping and
    // saying so beats a silent half hour.
    if (consecutiveFailures >= DOCUMENT_FAILURE_STREAK) {
      stoppedEarly = true;
      onProgress?.(`取标书链接：连续 ${consecutiveFailures} 条都失败，停在第 ${index + 1} / ${candidates.length} 条 —— 项目本身已经写入，只是没拿到附件链接`);
      break;
    }
    if ((index + 1) % 10 === 0 || index + 1 === candidates.length) {
      onProgress?.(`取标书链接：${index + 1} / ${candidates.length}${linkFailures > 0 ? `（失败 ${linkFailures}）` : ""}`);
    }
  }

  const saved = await saveDocumentLinks(supabase, entries);
  return {
    ...writeResult,
    documentLinks: {
      tendersAsked: asked,
      stoppedEarly,
      failureReasons,
      tendersWithLinks: saved.tendersWithLinks,
      linkCount: saved.linkCount,
      failed: linkFailures + saved.failed.length,
    },
  };
}


/**
 * What PNCP's compra record says, as a status — for the status refresh only.
 * The import's own inferStatus (brazil-pncp-mapper.ts) reads the SEARCH row,
 * whose fields differ; this reads the consulta record.
 *
 * Undefined for a situação this table does not know: an unknown state is
 * news, not evidence, and the stored status is left as it is.
 */
export function pncpCompraStatus(compra: PncpCompraState): TenderStatus | undefined {
  switch (compra.situacaoCompraId) {
    case 2:
    case 3:
      return "cancelled";
    case 4:
      return "suspended";
    case 1:
      return compra.existeResultado === true ? "awarded" : "open";
    default:
      return undefined;
  }
}

const COMPRA_LOOKUP_SPACING_MS = 300;

/**
 * Re-reads every PNCP tender stored here that has not already ended, one
 * consulta request each, and lets PNCP's current situação move its status:
 * 暂停中 on Suspensa, back to 招标中 when it is Divulgada again, 已取消 on
 * Revogada/Anulada, 已中标 once a result exists (user, 2026-09-26: 自动&手动，
 * 刷新标书状态).
 *
 * Needed because the daily sweep only asks for notices still receiving
 * proposals — a tender that is suspended or revoked after it was imported
 * never comes back through it.
 */
export async function refreshBrazilPncpStatuses(
  supabase: SupabaseClient,
  options: { write: boolean; limit?: number },
  onProgress?: (message: string) => void,
): Promise<StatusRefreshResult & { checked: number; unreachable: string[] }> {
  const stored: { slug: string; tender_number: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number")
      .eq("source_name", BRAZIL_PNCP_SOURCE_NAME)
      .not("status", "in", "(awarded,cancelled,deserted)")
      .range(from, from + 999);
    if (error) throw new Error(`读取已入库的巴西项目失败：${error.message}`);
    stored.push(...((data ?? []) as typeof stored));
    if ((data ?? []).length < 1000) break;
  }
  const targets = stored.slice(0, options.limit ?? stored.length);

  const observed: ObservedStatus[] = [];
  const unreachable: string[] = [];
  for (const [index, row] of targets.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, COMPRA_LOOKUP_SPACING_MS));
    try {
      const status = pncpCompraStatus(await fetchPncpCompra(row.tender_number));
      if (status) observed.push({ slug: row.slug, status });
    } catch (error) {
      unreachable.push(`${row.tender_number}：${error instanceof Error ? error.message : String(error)}`);
    }
    if ((index + 1) % 20 === 0) onProgress?.(`已查询 ${index + 1}/${targets.length}`);
  }

  const result = await refreshStoredStatuses(supabase, observed, { write: options.write });
  return { ...result, checked: targets.length, unreachable };
}
