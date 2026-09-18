import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPncpItems, fetchPncpSearchPage, PNCP_MAX_PAGE_SIZE, PNCP_WORKS_MODALITIES } from "@/lib/ingestion/connectors/brazil-pncp-live";
import { mapPncpSearchRowToTender, parsePncpDate, type PncpItem, type PncpSearchRow } from "@/lib/ingestion/brazil-pncp-mapper";
import { filterRecentTenders } from "@/lib/ingestion/recency";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import type { Tender } from "@/types/tender";
import { REVIEW_CSV_HEADERS, reviewCsvRow, toCsv, writeReviewCsv } from "./review-csv";

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
  /** Where the full excluded list was written for review. Produced on a DRY RUN too — the run that is supposed to be inspected before anything is written is exactly the one that needs it. */
  excludedCsvPath?: string;
  byModality: { modalidade: number; rows: number; pages: number }[];
  written?: number;
  failed?: number;
  write: boolean;
};

export type BrazilIngestOptions = {
  write: boolean;
  /** Keep tenders published within this many months. Defaults to 2, matching the other live connectors. */
  months?: number;
  /** Stop paging a modality once this many rows have been seen. The index is ~4.08M rows and has no date filter, so a sweep without a stop condition never ends. */
  maxRowsPerModality?: number;
  /** Which modality ids to sweep. Defaults to Concorrência Eletrônica + Presencial — the agreed initial scope. */
  modalities?: readonly number[];
  /** Skip the per-tender amount lookup. Halves the request count for a shape-only dry run; every row then reports no amount, which is NOT how they should be judged. */
  skipAmounts?: boolean;
};

/** PNCP throttles by resetting connections. The connector retries, but pacing means it has less to retry. */
const PACE_MS = 1_200;
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
  const maxRows = options.maxRowsPerModality ?? 600;
  const modalities = options.modalities ?? PNCP_WORKS_MODALITIES;

  const rows: PncpSearchRow[] = [];
  const byModality: BrazilIngestResult["byModality"] = [];

  for (const modalidade of modalities) {
    let pages = 0;
    let seen = 0;
    for (let pagina = 1; seen < maxRows; pagina += 1) {
      if (pagina > 1) await sleep(PACE_MS);
      const page = await fetchPncpSearchPage(modalidade, pagina, PNCP_MAX_PAGE_SIZE);
      pages += 1;
      if (page.items.length === 0) break;
      rows.push(...page.items);
      seen += page.items.length;
      onProgress?.(`采购方式 ${modalidade}：第 ${pagina} 页 ${page.items.length} 条（累计 ${seen}${page.total !== null ? ` / 索引共 ${page.total}` : ""}）`);
      if (page.items.length < PNCP_MAX_PAGE_SIZE) break;
    }
    byModality.push({ modalidade, rows: seen, pages });
  }

  const unique = dedupeRows(rows);
  if (unique.length !== rows.length) onProgress?.(`去重：${rows.length} → ${unique.length} 条（翻页期间索引在写入，同一条会出现两次）`);

  // Recency is decided on the search row, BEFORE the amount lookup. Each
  // lookup is a request against infrastructure that has been unreliable all
  // week, and spending one on a tender that the months filter will drop
  // anyway is the easiest request not to send.
  const withinWindow = unique.filter((row) => {
    const published = parsePncpDate(row.data_publicacao_pncp);
    if (!published) return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return new Date(published).getTime() >= cutoff.getTime();
  });
  onProgress?.(`发布时间在 ${months} 个月内的：${withinWindow.length} / ${unique.length} 条`);

  const mapped: Tender[] = [];
  let withoutAmount = 0;
  let sealedBudget = 0;
  for (const [index, row] of withinWindow.entries()) {
    let items: PncpItem[] | null = null;
    if (!options.skipAmounts) {
      if (index > 0) await sleep(PACE_MS);
      items = await fetchPncpItems(row.item_url);
      if (index % 25 === 0) onProgress?.(`取金额：${index + 1} / ${withinWindow.length}`);
    }
    const tender = mapPncpSearchRowToTender(row, items ?? undefined, BRAZIL_PNCP_SOURCE_NAME);
    if (!tender) continue;
    if (tender.estimatedValue === undefined) {
      withoutAmount += 1;
      if (items?.some((item) => item.orcamentoSigiloso === true)) sealedBudget += 1;
    }
    mapped.push(tender);
  }

  // A second recency pass on the mapped rows, so this connector obeys the
  // same filterRecentTenders() the others do rather than only its own
  // pre-filter above — the two agree, and the shared one is what the rest of
  // this codebase's behaviour is defined against.
  const kept = filterRecentTenders(mapped, months);
  const excluded = kept.filter((tender) => tender.relevance.tier === "excluded");
  const excludedCount = excluded.length;

  const reasonCounts = new Map<string, number>();
  for (const tender of excluded) {
    const reason = tender.relevance.reason?.zh ?? "(无理由)";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const result: BrazilIngestResult = {
    fetchedRows: rows.length,
    mappedCount: mapped.length,
    keptCount: kept.length - excludedCount,
    excludedCount,
    excludedByReason: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    withoutAmount,
    sealedBudget,
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
  return { ...result, written: written.upsertedCount, failed: written.failed.length };
}
