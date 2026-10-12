import type { SupabaseClient } from "@supabase/supabase-js";
import { applyAbbreviationNotes, findAbbreviationNotesBatch, type AbbreviationNote } from "@/lib/ingestion/abbreviation-notes";
import { checkGenerated, toInput, type DisplayTextRow } from "@/lib/ingestion/generate-public-titles";
import { generateDisplayTextBatch, type GeneratedDisplayText } from "@/lib/ingestion/public-title-qwen";

/**
 * Re-title a tender from its 一句话总结 (user, 2026-10-12: 很多项目的标题不清晰，
 * 用各种缩写 … 能不能通过一句话总结来优化标题，包括访客标题、订阅用户标题、
 * 正式完整标题).
 *
 * Two steps, for rows that have a 一句话总结:
 * 1. Full title (title.zh): Chinese notes inserted after its abbreviations,
 *    nothing removed (lib/ingestion/abbreviation-notes.ts). title.es is
 *    never touched.
 * 2. Member short title, visitor title and visitor summary: generated again
 *    from the noted title plus the 一句话总结, through the same validators as
 *    `npm run titles:public`. A refused field keeps its current value.
 *
 * Anything an admin edited (manual_field_overrides) is skipped, field by
 * field. Used by `npm run titles:from-summary` for stored rows, and by
 * document analysis right after it writes a new 一句话总结.
 */

export type RefreshRow = DisplayTextRow & { one_line_summary: string };

type Change = { before: string | null; after: string | null; problems: string[]; pinned: boolean };

export type TitleRefreshOutcome = {
  slug: string;
  oneLineSummary: string;
  title: Change & { notes: AbbreviationNote[]; refusedNotes: { note: AbbreviationNote; reason: string }[] };
  short: Change;
  publicTitle: Change;
  publicSummary: Change;
  written: boolean;
  error?: string;
};

export const REFRESH_COLUMNS = "slug, title, summary, title_zh_short, title_zh_public, summary_zh_public, country, manual_field_overrides, one_line_summary";

/** Untranslated rows (zh mirrors es) have nothing to work from; rows without a 一句话总结 have nothing new to add. */
export function canRefresh(row: DisplayTextRow): row is RefreshRow {
  return Boolean(row.one_line_summary?.trim()) && row.title.zh.trim() !== row.title.es.trim();
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

  // Step 2: the three display strings, from the noted title.
  const generated = new Map<string, GeneratedDisplayText>();
  try {
    for (const item of await generateDisplayTextBatch(noted.map(({ next }) => toInput(next)))) generated.set(item.slug, item);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  for (const { next } of noted.filter(({ row }) => !generated.has(row.slug))) {
    try {
      const [single] = await generateDisplayTextBatch([toInput(next)]);
      if (single) generated.set(single.slug, single);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const outcomes: TitleRefreshOutcome[] = [];
  for (const { row, applied, next } of noted) {
    const pinned = pinnedOf(row);
    const got = generated.get(row.slug);
    const checked = got ? checkGenerated(next, got) : null;
    const change = (column: "title_zh_short" | "title_zh_public" | "summary_zh_public", value: string | undefined, problems: string[]): Change => {
      const isPinned = pinned.has(column);
      const usable = !isPinned && value !== undefined && problems.length === 0;
      return { before: row[column], after: usable ? value : row[column], problems: value === undefined ? ["模型没有返回"] : problems, pinned: isPinned };
    };
    const outcome: TitleRefreshOutcome = {
      slug: row.slug,
      oneLineSummary: row.one_line_summary,
      title: { before: row.title.zh, after: applied.title, problems: [], pinned: pinned.has("title"), notes: applied.applied, refusedNotes: applied.refused },
      short: change("title_zh_short", checked?.short.value, checked?.short.problems ?? []),
      publicTitle: change("title_zh_public", checked?.publicTitle.value, checked?.publicTitle.problems ?? []),
      publicSummary: change("summary_zh_public", checked?.publicSummary.value, checked?.publicSummary.problems ?? []),
      written: false,
      ...(got === undefined && error ? { error } : {}),
    };

    const update: Record<string, unknown> = {};
    if (outcome.title.after !== outcome.title.before) update.title = next.title;
    if (outcome.short.after !== outcome.short.before) update.title_zh_short = outcome.short.after;
    if (outcome.publicTitle.after !== outcome.publicTitle.before) update.title_zh_public = outcome.publicTitle.after;
    if (outcome.publicSummary.after !== outcome.publicSummary.before) update.summary_zh_public = outcome.publicSummary.after;

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
 */
export async function refreshTitlesAfterAnalysis(supabase: SupabaseClient, tenderId: string): Promise<string | null> {
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
    const row = data as DisplayTextRow;
    if (!canRefresh(row)) return null;
    const [outcome] = await refreshTitlesFromSummary(supabase, [row], { write: true });
    return outcome?.error ? `标题没有按一句话总结更新：${outcome.error}` : null;
  } catch (err) {
    return `标题没有按一句话总结更新：${err instanceof Error ? err.message : String(err)}`;
  }
}
