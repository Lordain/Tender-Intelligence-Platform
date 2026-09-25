/**
 * Shared Chile ingestion — the one path any caller goes through, for BOTH
 * Chilean doors.
 *
 * Three callers: `npm run ingest:chile-live`, the daily `cron:chile`, and the
 * 智利 tab's button on 新项目清单 (app/api/admin/import-chile, added
 * 2026-09-25 at the user's request). One path, so none of them can drift —
 * exactly the reason ingest-peru.ts and ingest-colombia.ts exist.
 *
 * ── Two doors, and why both are kept ──────────────────────────────────────
 *
 *   "ocds"   apis/api.mercadopublico.cl OCDS export. Structured, versioned
 *            OCDS 1.1, CC0, carries a region field. Published nothing since
 *            2026-07-29 (measured 2026-09-24).
 *   "busca"  www.mercadopublico.cl's public search. No credential. Serves
 *            tenders published TODAY. It is a UI, not a published data API.
 *
 * The OCDS door is NOT replaced or weakened by adding the second one. It stays
 * the structured, already-tested path, and it starts working again by itself
 * if ChileCompra resumes — at which point the two overlap and dedupe cleanly,
 * because both key on the same `NNNN-NN-XXNN` tender code and both mappers
 * build the same `chile-<code>` slug. A 25-row cross-check resolved 24 in OCDS
 * with a byte-identical `tender.id`; the one miss was published on 2026-07-29,
 * OCDS's last day.
 *
 * ── The thing this importer has to be honest about ────────────────────────
 *
 * A run on the OCDS door asking for "the last two months" today fetches two
 * empty months and keeps zero rows — and would report that as a clean,
 * successful import.
 *
 * `freshnessWarning` exists so it cannot. An importer that reads a stalled
 * feed as an empty one announces success forever, which is the README's
 * 够不着 ≠ 空 ≠ 还没发布 ≠ 根本没问 rule one step further along: the source
 * stopped and nobody noticed. The busca door has its own version of the same
 * check — see `staleWarning` — because "the search returned nothing new" and
 * "the parser stopped matching the markup" look identical from here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeIndexFreshness,
  fetchChileOcdsMonth,
} from "@/lib/ingestion/connectors/chile-ocds-live";
import { CHILE_SOURCE_NAME, mapChileOcdsPackageToTender } from "@/lib/ingestion/chile-ocds-mapper";
import {
  ChileBuscaSession,
  fetchChileBuscaOpenTenders,
  warmSession,
} from "@/lib/ingestion/connectors/chile-busca-live";
import {
  parseChileBuscaCsv,
  type ChileBuscaCard,
  type ChileBuscaRow,
} from "@/lib/ingestion/chile-busca-parser";
import { CHILE_BUSCA_SOURCE_NAME, mapChileBuscaRowToTender } from "@/lib/ingestion/chile-busca-mapper";
import { ChileFichaEgressBlockedError, fetchChileFicha } from "@/lib/ingestion/connectors/chile-ficha-live";
import { filterRecentTenders, filterTendersPublishedWithinDays } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender, TenderRelevanceTier } from "@/types/tender";

export { CHILE_SOURCE_NAME, CHILE_BUSCA_SOURCE_NAME };

/** Which Chilean door to read. See this file's header. */
export type ChileDoor = "ocds" | "busca";

export type ChileIngestResult = {
  door: ChileDoor;
  months: string[];
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  /** Rows that would actually surface in the feed — everything not "excluded". */
  surfacedCount: number;
  tierCounts: Record<TenderRelevanceTier, number>;
  /** Per-record fetch failures, which do NOT fail the month — see fetchChileOcdsMonth. */
  failedRecords: { code: string; error: string }[];
  /**
   * Non-null when every requested month came back empty. Printed loudly rather
   * than returned as a zero — see this file's header.
   */
  freshnessWarning: string | null;
  /**
   * The busca door's equivalent: non-null when the search returned rows but
   * none of them is recent, or when it returned nothing at all. Same rule as
   * freshnessWarning — a zero that might mean "the parser broke" is never
   * allowed to read as "a quiet day".
   */
  staleWarning: string | null;
  /** busca only: CSV rows whose field count was not 11. Reported, never silently dropped — see parseChileBuscaCsv. */
  malformedRows: { line: number; fields: number; text: string }[];
  /** busca only: `Estado` texts this repo has no mapping for. A new one is news, not a row to default to "open". */
  unmappedEstados: string[];
  /** busca only: rows whose amount is a UTM band rather than a number, which is 45% of the corpus. */
  bandedAmountCount: number;
  /** busca only: how many kept rows got a closing date from the HTML fragment. */
  enrichedCount: number;
  write: boolean;
  preview?: Tender[];
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};

export type ChileIngestOptions = {
  write: boolean;
  /** Which door. Defaults to "ocds" so every existing caller keeps its behaviour unchanged. */
  door?: ChileDoor;
  /**
   * busca only: how many of the kept rows to read a closing date for, newest
   * first. One request per row, against that row's OWN ficha.
   *
   * Bounded because it is a request per tender against someone else's front
   * end — and because a run that stops being polite gets throttled: 600
   * requests in fifteen minutes drew HTTP 403s and throttle pages a third of
   * the way through (see chile-ficha-live.ts).
   */
  enrichLimit?: number;
  /**
   * busca only: a wall-clock time (epoch ms) after which no further ficha is
   * read. The admin button runs inside a 300-second function and cannot
   * afford the CLI's "read every kept row"; rows it runs out of time for are
   * written without a closing date, and the next daily run fills them in —
   * an import never erases a stored deadline (NEVER_NULLED_BY_AN_IMPORT).
   */
  enrichUntil?: number;
  /** Calendar months back from `now` to fetch, newest first. Ignored when `month` is set. */
  months?: number;
  /** One specific `YYYY-MM`. */
  month?: string;
  /** Rolling window in days applied to what is KEPT. The fetch is still whole months — the index has no finer grain. */
  days?: number;
  /** Stop after this many records per month. For a cheap look at a ~9,000-record month. */
  maxRecords?: number;
  /** Return every kept row, not just the top five — the CLI's classification report needs all of them. */
  preview?: boolean;
};

/** `YYYY-MM` labels, newest first, built off UTC parts so the list cannot shift under a machine's local zone. */
export function recentChileMonths(months: number, now: Date = new Date()): string[] {
  const count = months > 0 ? months : 1;
  const labels: string[] = [];
  for (let back = 0; back < count; back++) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    labels.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return labels;
}

/**
 * Which rows survive the fetch — and, more importantly, when NOT to filter.
 *
 * `--month 2026-07` asking for 60 records and keeping 0 is what this function
 * exists to prevent, and it is not hypothetical: it is what the first real
 * dry run of this importer did. `--month` names a window explicitly, and the
 * default two-month recency filter then silently applied a SECOND, narrower
 * window on top of it — every one of those 60 real records was published
 * before the 2026-07-24 cutoff, so all 60 were dropped and the run reported
 * "Mapped 60, keeping 0" as though the month were uninteresting.
 *
 * The bite is worse for Chile specifically than it would be anywhere else,
 * because the newest month this source has is already ~2 months old: asking
 * for it BY NAME is the only way to see any Chilean data at all right now,
 * and that is exactly the call the filter was eating.
 *
 * So: an explicitly named month is the window. `--days` still narrows it for
 * a caller who wants that, because they asked for it in the same breath.
 */
function applyRecency(mapped: Tender[], options: ChileIngestOptions): Tender[] {
  if (options.days && options.days > 0) return filterTendersPublishedWithinDays(mapped, options.days);
  if (options.month) return mapped;
  return filterRecentTenders(mapped, options.months ?? 2);
}

function parseMonthLabel(label: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(label);
  if (!match) throw new Error(`月份要写成 YYYY-MM，收到的是「${label}」`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/**
 * The busca door.
 *
 * Shape notes, each of them a measurement rather than a preference:
 *
 * - The export is walked across the full cross product of closing-date bucket
 *   × amount visibility, because neither has a working "all" value. A caller
 *   who sends the site's own default payload silently gets 26% of the corpus.
 *   See the constants in chile-busca-live.ts.
 * - Rows are deduped by tender code across groups. The six groups measured
 *   disjoint on 2026-09-24 (0 duplicates in 4,055), but this is a live feed
 *   and a tender that changes bucket between two requests would otherwise be
 *   imported twice.
 * - HTML enrichment happens AFTER recency filtering, so the expensive,
 *   10-rows-per-request path is only spent on rows this run will actually
 *   keep, and cards are joined to rows by tender code rather than by position.
 */
async function fetchBuscaRows(
  session: ChileBuscaSession,
  options: ChileIngestOptions,
  onProgress?: (message: string) => void,
): Promise<{ rows: ChileBuscaRow[]; malformed: { line: number; fields: number; text: string }[]; pageCount: number }> {
  const { pages } = await fetchChileBuscaOpenTenders(
    session,
    { maxRows: options.maxRecords, maxPagesPerGroup: 10 },
    onProgress,
  );

  const byCode = new Map<string, ChileBuscaRow>();
  const malformed: { line: number; fields: number; text: string }[] = [];
  for (const page of pages) {
    const parsed = parseChileBuscaCsv(page.csv);
    malformed.push(...parsed.malformed);
    for (const row of parsed.rows) if (!byCode.has(row.id)) byCode.set(row.id, row);
  }
  const rows = [...byCode.values()];
  onProgress?.(`导出共 ${rows.length} 条不重复招标（${pages.length} 个 CSV 页），格式异常行 ${malformed.length} 条`);
  return { rows, malformed, pageCount: pages.length };
}

/**
 * The closing date for each shortlisted row, read from that row's OWN ficha.
 *
 * Returns partial cards — only what a ficha carries. `comprasEfectuadas` is
 * NOT among them: the search card has that counter, the ficha does not, and it
 * is left undefined rather than filled with something adjacent. Losing it
 * costs nothing that was ever reliably there, because the card walk this
 * replaced reached almost none of these rows in the first place.
 *
 * ── Why the card walk was wrong ──────────────────────────────────────────
 *
 * It read the search-result HTML, ten cards per request, and kept the first N
 * it met. Its own comment said the enrichment was "applied to the rows this
 * run is actually going to keep". It was not: it walked the search pages in
 * the site's own order, and the kept rows are a relevance-filtered subset
 * scattered through a 1,309-row shortlist. A run asking for 60 closing dates
 * filled sixty rows that were mostly other people's — which is why 60 stored
 * Chilean rows reached production with no deadline at all.
 *
 * One failed tender does not fail the run — a missing deadline costs a field,
 * not an import — but failures are reported, because a fetcher that has
 * quietly stopped matching is what this door is most likely to do.
 */
async function enrichFromFichas(
  shortlist: { row: ChileBuscaRow }[],
  limit: number,
  onProgress?: (message: string) => void,
  until?: number,
): Promise<Map<string, ChileBuscaCard>> {
  const cards = new Map<string, ChileBuscaCard>();
  let failed = 0;
  const batch = shortlist.slice(0, limit);
  for (const [index, entry] of batch.entries()) {
    if (until !== undefined && Date.now() > until) {
      onProgress?.(`⏱ 时间用完，剩下 ${batch.length - index} 条没读 ficha（没有截止日，下一次每日任务会补上）`);
      break;
    }
    // Otherwise silent for minutes at 2.5 s a request, which in a CI log is
    // indistinguishable from a hang.
    if (index > 0 && index % 10 === 0) onProgress?.(`ficha 进度：${index} / ${batch.length}（读到截止日 ${cards.size} 条）`);
    try {
      const ficha = await fetchChileFicha(entry.row.id);
      if (ficha.closing) cards.set(entry.row.id, { id: entry.row.id, submissionDeadline: ficha.closing.date });
    } catch (err) {
      failed += 1;
      if (failed <= 3) {
        onProgress?.(`⚠ ${entry.row.id} 的 ficha 读不到：${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
      // A blocked container is a fact about us and applies to every remaining
      // row, so there is no point walking the rest one timeout at a time.
      if (err instanceof ChileFichaEgressBlockedError) break;
    }
  }
  if (failed > 0) onProgress?.(`⚠ 共 ${failed} 条 ficha 没读到交标截止日（其余 ${cards.size} 条读到了）`);
  return cards;
}

export async function ingestChile(
  supabase: SupabaseClient | null,
  options: ChileIngestOptions,
  onProgress?: (message: string) => void,
): Promise<ChileIngestResult> {
  if ((options.door ?? "ocds") === "busca") return ingestChileViaBusca(supabase, options, onProgress);
  const months = options.month ? [options.month] : recentChileMonths(options.months ?? 2);

  const packages = [];
  const failedRecords: { code: string; error: string }[] = [];
  const monthSummaries: { label: string; empty: boolean; total: number }[] = [];
  for (const label of months) {
    const { year, month } = parseMonthLabel(label);
    const fetched = await fetchChileOcdsMonth(year, month, { maxRecords: options.maxRecords }, onProgress);
    monthSummaries.push({ label, empty: fetched.empty, total: fetched.total });
    packages.push(...fetched.packages);
    failedRecords.push(...fetched.failed);
    onProgress?.(`${label}：取到 ${fetched.packages.length} 条（索引说共 ${fetched.total} 条），失败 ${fetched.failed.length} 条`);
  }

  const mapped: Tender[] = [];
  for (const pkg of packages) {
    const tender = mapChileOcdsPackageToTender(pkg);
    if (tender) mapped.push(tender);
  }

  const kept = applyRecency(mapped, options);

  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of kept) tierCounts[tender.relevance.tier] += 1;

  const result: ChileIngestResult = {
    door: "ocds",
    months,
    fetchedCount: packages.length,
    mappedCount: mapped.length,
    keptAfterRecencyCount: kept.length,
    surfacedCount: kept.length - tierCounts.excluded,
    tierCounts,
    failedRecords,
    freshnessWarning: describeIndexFreshness(monthSummaries),
    staleWarning: null,
    malformedRows: [],
    unmappedEstados: [],
    bandedAmountCount: 0,
    enrichedCount: 0,
    write: options.write,
    ...(options.preview ? { preview: kept } : {}),
    sample: kept
      .filter((tender) => tender.relevance.tier !== "excluded")
      .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
      .slice(0, 5),
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}

/**
 * Says, in one line, whether a busca run that kept nothing is news.
 *
 * The busca door cannot go stale the way OCDS did — it is the site's own
 * search, so if it is serving the page at all it is serving current data. What
 * it CAN do is change its markup or its CSV columns under a parser that then
 * matches nothing, and from inside this function that is indistinguishable
 * from a quiet day. So the same rule applies as for the OCDS index: a zero is
 * never allowed to read as "nothing was published".
 *
 * Returns a message rather than throwing. A genuinely empty result is not an
 * error, it is news, and news belongs where a person reads it.
 */
export function describeBuscaStaleness(
  rowCount: number,
  mappedCount: number,
  newestPublication: string | undefined,
  now: Date = new Date(),
): string | null {
  if (rowCount === 0) {
    return (
      "⚠ 智利公开搜索一条都没返回。\n" +
      "  这不等于「今天没有新招标」—— 实测 2026-09-24 这个门下有 4,055 条在招项目，当天发布的就有 168 条。\n" +
      "  更可能的原因是：导出被拒（GenerarArchivo 的 estado=false，通常是 idTipoFecha 不合法），\n" +
      "  或者对方改了页面而解析器不再匹配。先跑 npm run capture:chile-busca 看对方现在发的是什么。"
    );
  }
  if (mappedCount === 0) {
    return (
      `⚠ 导出回了 ${rowCount} 行，但一条都没能映射成招标记录。\n` +
      "  行是有的，说明网络和导出都没问题 —— 是字段含义对不上了。\n" +
      "  多半是 Estado 文案变了（映射表在 chile-busca-mapper.ts）或者列顺序变了。"
    );
  }
  if (!newestPublication) return null;
  const days = Math.floor((now.getTime() - new Date(newestPublication).getTime()) / 86_400_000);
  if (days < 14) return null;
  return (
    `⚠ 导出里最新的发布日期是 ${newestPublication.slice(0, 10)}，距今 ${days} 天。\n` +
    "  实测这个门是零延迟的（2026-09-24 当天发布的标当天就在结果里），所以两周以上的空档不正常。\n" +
    "  要么对方停更了，要么 FechaPublicacion 这一列的含义变了。"
  );
}

async function ingestChileViaBusca(
  supabase: SupabaseClient | null,
  options: ChileIngestOptions,
  onProgress?: (message: string) => void,
): Promise<ChileIngestResult> {
  const session = await warmSession(new ChileBuscaSession());
  const { rows, malformed } = await fetchBuscaRows(session, options, onProgress);

  // Mapped once WITHOUT cards, purely to decide which rows are worth the
  // expensive HTML round trip. The closing date is then filled in on the
  // survivors and they are re-mapped, because the deadline changes the status.
  const unmappedEstados = new Set<string>();
  const firstPass: { row: ChileBuscaRow; tender: Tender }[] = [];
  for (const row of rows) {
    const mapped = mapChileBuscaRowToTender(row);
    if (mapped) firstPass.push({ row, tender: mapped.tender });
    else if (row.estado && !unmappedEstados.has(row.estado)) unmappedEstados.add(row.estado);
  }

  const keptCodes = new Set(applyRecency(firstPass.map((entry) => entry.tender), options).map((t) => t.tenderNumber));
  const shortlist = firstPass.filter((entry) => keptCodes.has(entry.row.id));

  // Only the rows that will be KEPT are worth a ficha request. The shortlist
  // is every open tender in the window — 3,951 on 2026-09-25, of which 72
  // were kept — and at CHILE_FICHA_REQUEST_SPACING_MS each request costs
  // 2.5 s, so enriching in shortlist order spent the budget on rows the
  // classifier then threw away and would have taken hours uncapped. The
  // tier does not depend on the closing date, so filtering first changes
  // nothing about which rows are kept.
  const toEnrich = shortlist.filter((entry) => entry.tender.relevance.tier !== "excluded");
  const enrichLimit = options.enrichLimit ?? 0;
  let cards = new Map<string, ChileBuscaCard>();
  if (enrichLimit > 0 && toEnrich.length > 0) {
    onProgress?.(`开始逐条读 ficha 补交标截止日（只读会保留的 ${toEnrich.length} 条，上限 ${enrichLimit} 条）——CSV 里没有这一列`);
    cards = await enrichFromFichas(toEnrich, Math.min(enrichLimit, toEnrich.length), onProgress, options.enrichUntil);
    onProgress?.(`补到 ${cards.size} 条交标截止日`);
  }

  const mapped: Tender[] = [];
  let bandedAmountCount = 0;
  let enrichedCount = 0;
  for (const entry of shortlist) {
    const card = cards.get(entry.row.id);
    const result = mapChileBuscaRowToTender(entry.row, card);
    if (!result) continue;
    if (result.amountBand) bandedAmountCount += 1;
    if (result.tender.submissionDeadline) enrichedCount += 1;
    mapped.push(result.tender);
  }

  const kept = mapped;
  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };
  for (const tender of kept) tierCounts[tender.relevance.tier] += 1;

  const newestPublication = rows
    .map((row) => row.fechaPublicacion)
    .map((value) => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
      return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
    })
    .filter((value): value is string => value !== undefined)
    .sort()
    .at(-1);

  const result: ChileIngestResult = {
    door: "busca",
    months: [],
    fetchedCount: rows.length,
    mappedCount: firstPass.length,
    keptAfterRecencyCount: kept.length,
    surfacedCount: kept.length - tierCounts.excluded,
    tierCounts,
    failedRecords: [],
    freshnessWarning: null,
    staleWarning: describeBuscaStaleness(rows.length, firstPass.length, newestPublication),
    malformedRows: malformed,
    unmappedEstados: [...unmappedEstados],
    bandedAmountCount,
    enrichedCount,
    write: options.write,
    ...(options.preview ? { preview: kept } : {}),
    sample: kept
      .filter((tender) => tender.relevance.tier !== "excluded")
      .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
      .slice(0, 5),
  };

  if (!options.write) return result;
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, kept);
  return { ...result, upsertedCount, skippedExcludedCount, failed };
}
