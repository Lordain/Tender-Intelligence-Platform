import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAbbreviationNotes, findAbbreviationNotesBatch, type AbbreviationNote } from "@/lib/ingestion/abbreviation-notes";
import type { DisplayTextRow } from "@/lib/ingestion/generate-public-titles";
import { droppedSourceSpellings, refineTitlesBatch, type RefineResult } from "@/lib/ingestion/title-refine-qwen";
import { publicTitleProblems, shortTitleProblems } from "@/lib/public-title";
import { deriveTenderStatus } from "@/lib/tender-status";
import { LIVE_TENDER_STATUSES } from "@/lib/tender-list-page";
import type { TenderStatus } from "@/types/tender";

/**
 * Re-title a tender from its 一句话总结 (user, 2026-10-12: 很多项目的标题不清晰，
 * 用各种缩写 … 能不能通过一句话总结来优化标题，包括访客标题、订阅用户标题、
 * 正式完整标题).
 *
 * Two steps, for rows that have a 一句话总结:
 * 1. Full title (title.zh): Chinese notes inserted after its abbreviations,
 *    nothing removed (lib/ingestion/abbreviation-notes.ts). title.es is
 *    never touched.
 * 2. Member short title and visitor title: changed only where the 一句话总结
 *    shows they are unclear (title-refine-qwen.ts), through the same
 *    validators as `npm run titles:public`, and a short title may not drop
 *    a source spelling. A refused field keeps its current value.
 *
 * Titles only (user, 2026-10-12: 只考虑标题，不要动摘要): no summary column
 * is written.
 *
 * Anything an admin edited (manual_field_overrides) is skipped, field by
 * field. Used by `npm run titles:from-summary` for stored rows, and by
 * document analysis right after it writes a new 一句话总结.
 */

/** The status columns deriveTenderStatus needs, so only tenders still taking bids are touched. */
type StatusFields = { status: TenderStatus; submission_deadline: string | null; publication_date: string | null; source_name: string | null };
export type CandidateRow = DisplayTextRow & StatusFields;
export type RefreshRow = CandidateRow & { one_line_summary: string };

type Change = { before: string | null; after: string | null; problems: string[]; pinned: boolean };

export type TitleRefreshOutcome = {
  slug: string;
  oneLineSummary: string;
  title: Change & { notes: AbbreviationNote[]; refusedNotes: { note: AbbreviationNote; reason: string }[] };
  short: Change;
  publicTitle: Change;
  written: boolean;
  error?: string;
};

export const REFRESH_COLUMNS =
  "slug, title, summary, title_zh_short, title_zh_public, summary_zh_public, country, manual_field_overrides, one_line_summary, status, submission_deadline, publication_date, source_name";

/**
 * Only tenders still taking bids — the same live statuses as 当前在招 on the
 * site (user, 2026-10-12: 只看投标中的项目，不要全开). Closed, awarded and
 * cancelled tenders keep their titles: retitling them costs model calls and
 * helps no one bid.
 */
export function isBiddingNow(row: StatusFields, now: Date = new Date()): boolean {
  const status = deriveTenderStatus(
    row.status,
    { submissionDeadline: row.submission_deadline, publicationDate: row.publication_date, sourceName: row.source_name },
    now,
  );
  return LIVE_TENDER_STATUSES.includes(status);
}

/**
 * Untranslated rows (zh mirrors es) have nothing to work from; rows without a
 * 一句话总结 have nothing new to add; tenders no longer taking bids are left.
 */
export function canRefresh(row: CandidateRow): row is RefreshRow {
  return Boolean(row.one_line_summary?.trim()) && row.title.zh.trim() !== row.title.es.trim() && isBiddingNow(row);
}

const BATCH_SIZE = 10;

export async function refreshTitlesFromSummary(
  supabase: SupabaseClient,
  rows: RefreshRow[],
  options: { write: boolean; onProgress?: (done: number, total: number) => void },
): Promise<TitleRefreshOutcome[]> {
  const outcomes: TitleRefreshOutcome[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    outcomes.push(...(await refreshBatch(supabase, rows.slice(i, i + BATCH_SIZE), options.write)));
    options.onProgress?.(Math.min(i + BATCH_SIZE, rows.length), rows.length);
  }
  return outcomes;
}

async function refreshBatch(supabase: SupabaseClient, batch: RefreshRow[], write: boolean): Promise<TitleRefreshOutcome[]> {
  const pinnedOf = (row: RefreshRow) => new Set(row.manual_field_overrides ?? []);

  // Step 1: notes on the full title.
  const titleRows = batch.filter((row) => !pinnedOf(row).has("title"));
  const notesBySlug = new Map<string, AbbreviationNote[]>();
  let error: string | undefined;
  if (titleRows.length > 0) {
    try {
      const found = await findAbbreviationNotesBatch(titleRows.map((row) => ({ slug: row.slug, titleZh: row.title.zh, oneLineSummary: row.one_line_summary })));
      for (const item of found) notesBySlug.set(item.slug, item.notes);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  const noted = batch.map((row) => {
    const applied = applyAbbreviationNotes(row.title.zh, row.one_line_summary, notesBySlug.get(row.slug) ?? []);
    return { row, applied, next: { ...row, title: { ...row.title, zh: applied.title } } as RefreshRow };
  });

  // Step 2: fix the short and visitor titles only where the 一句话总结 shows
  // they are unclear (lib/ingestion/title-refine-qwen.ts). Empty columns are
  // left to `npm run titles:public`, which fills missing ones.
  const refined = new Map<string, RefineResult>();
  const inputs = noted
    .filter(({ row }) => (row.title_zh_short ?? "").trim() !== "" || (row.title_zh_public ?? "").trim() !== "")
    .map(({ row, next }) => ({
      slug: row.slug,
      country: row.country,
      titleZh: next.title.zh,
      oneLineSummary: row.one_line_summary,
      titleZhShort: row.title_zh_short ?? "",
      titleZhPublic: row.title_zh_public ?? "",
    }));
  if (inputs.length > 0) {
    try {
      for (const item of await refineTitlesBatch(inputs)) refined.set(item.slug, item);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    for (const input of inputs.filter((item) => !refined.has(item.slug))) {
      try {
        const [single] = await refineTitlesBatch([input]);
        if (single) refined.set(single.slug, single);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const outcomes: TitleRefreshOutcome[] = [];
  for (const { row, applied, next } of noted) {
    const pinned = pinnedOf(row);
    const got = refined.get(row.slug);
    const source = [next.title.zh, row.summary.zh, row.one_line_summary].join("\n");
    const change = (column: "title_zh_short" | "title_zh_public", value: string | undefined): Change => {
      const before = row[column];
      const isPinned = pinned.has(column);
      if (isPinned || (before ?? "").trim() === "" || value === undefined || value === before) {
        return { before, after: before, problems: value === undefined && !isPinned && (before ?? "").trim() !== "" ? ["模型没有返回"] : [], pinned: isPinned };
      }
      const problems =
        column === "title_zh_short"
          ? [
              ...shortTitleProblems(value, next.title.zh, source),
              ...droppedSourceSpellings(before ?? "", value).map((spelling) => `删掉了地名原文${spelling}`),
            ]
          : publicTitleProblems(value);
      return { before, after: problems.length === 0 ? value : before, problems, pinned: false };
    };
    const outcome: TitleRefreshOutcome = {
      slug: row.slug,
      oneLineSummary: row.one_line_summary,
      title: { before: row.title.zh, after: applied.title, problems: [], pinned: pinned.has("title"), notes: applied.applied, refusedNotes: applied.refused },
      short: change("title_zh_short", got?.titleZhShort),
      publicTitle: change("title_zh_public", got?.titleZhPublic),
      written: false,
      ...(got === undefined && error ? { error } : {}),
    };

    const update: Record<string, unknown> = {};
    if (outcome.title.after !== outcome.title.before) update.title = next.title;
    if (outcome.short.after !== outcome.short.before) update.title_zh_short = outcome.short.after;
    if (outcome.publicTitle.after !== outcome.publicTitle.before) update.title_zh_public = outcome.publicTitle.after;

    if (write && Object.keys(update).length > 0) {
      const { error: updateError } = await supabase.from("tenders").update({ ...update, updated_at: new Date().toISOString() }).eq("slug", row.slug);
      if (updateError) outcome.error = updateError.message;
      else outcome.written = true;
    }
    outcomes.push(outcome);
  }
  return outcomes;
}

/**
 * Analysis is already a long request, and this adds two model calls to it.
 * Past this, analysis returns with a warning instead of waiting, so a slow
 * DashScope can never push the analysis request past its time limit.
 */
const AFTER_ANALYSIS_TIMEOUT_MS = 45_000;

/**
 * The hook document analysis calls after writing a new 一句话总结. Never
 * throws: a failure here must not fail an analysis that already succeeded,
 * so it comes back as a warning line instead.
 *
 * `wait: true` drops the time limit. 本地批量分析 runs on the operator's own
 * dev server, where no request limit applies, and there the timeout only
 * reported 超时 while the update went on finishing in the background
 * (2026-10-13, two of 16 Brazil tenders) — a warning that said 没有更新 about
 * a title that may well have been updated.
 */
export async function refreshTitlesAfterAnalysis(supabase: SupabaseClient, tenderId: string, options: { wait?: boolean } = {}): Promise<string | null> {
  if (options.wait) return refreshOne(supabase, tenderId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve("标题没有按一句话总结更新：超时，可稍后用 npm run titles:from-summary 补上"), AFTER_ANALYSIS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([refreshOne(supabase, tenderId), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function refreshOne(supabase: SupabaseClient, tenderId: string): Promise<string | null> {
  try {
    if (!process.env.DASHSCOPE_API_KEY) return null;
    const { data, error } = await supabase.from("tenders").select(REFRESH_COLUMNS).eq("id", tenderId).maybeSingle();
    if (error || !data) return error ? `标题没有按一句话总结更新：${error.message}` : null;
    const row = data as CandidateRow;
    if (!canRefresh(row)) return null;
    const [outcome] = await refreshTitlesFromSummary(supabase, [row], { write: true });
    return outcome?.error ? `标题没有按一句话总结更新：${outcome.error}` : null;
  } catch (err) {
    return `标题没有按一句话总结更新：${err instanceof Error ? err.message : String(err)}`;
  }
}
