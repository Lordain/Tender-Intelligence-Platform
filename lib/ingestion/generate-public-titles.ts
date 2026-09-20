import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDisplayTextBatch, type DisplayTextInput } from "@/lib/ingestion/public-title-qwen";
import { publicSummaryProblems, publicTitleProblems, shortTitleProblems } from "@/lib/public-title";
import type { LocalizedText } from "@/types/tender";

/**
 * Fill the three derived display columns — tenders.title_zh_short,
 * tenders.title_zh_public (0053) and tenders.summary_zh_public (0054).
 *
 * Deliberately a separate pass from the translation rather than more fields
 * on the translation prompt. The translation is the product for a subscriber
 * and has to be as precise as it can be; this pass exists to throw precision
 * away in two different directions at once. One prompt asked to do both would
 * be asked to keep and to drop the same proper noun in the same breath.
 *
 * `title.zh` and `summary.zh` are never written here. They stay exactly as
 * translated, and clearing these three columns returns the site to its
 * previous behaviour.
 */
const BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type DisplayTextRow = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  title_zh_short: string | null;
  title_zh_public: string | null;
  summary_zh_public: string | null;
  country: string | null;
  manual_field_overrides: string[] | null;
};

/** The three generated columns, paired with the override key that pins each one. */
const GENERATED_COLUMNS = ["title_zh_short", "title_zh_public", "summary_zh_public"] as const;
type GeneratedColumn = (typeof GENERATED_COLUMNS)[number];

/**
 * Rows worth spending a model call on.
 *
 * `title.zh === title.es` is the untranslated() mirror every mapper writes.
 * Those rows have no Chinese text to work from, and every public surface
 * already replaces them with 政府采购项目, so generating would spend a call to
 * publish a placeholder — and would feed the prompt the untranslated original,
 * which is the exact text it exists to remove.
 *
 * Any ONE missing column selects the row, because one call fills all three:
 * a row that has a public title but no public summary is still leaking, and
 * re-running the model for it costs the same as skipping it would save.
 * Columns pinned by manual_field_overrides are excluded individually below —
 * a hand-written public title does not stop the summary being generated.
 */
export function needsDisplayText(row: DisplayTextRow): boolean {
  if (row.title.zh.trim() === row.title.es.trim()) return false;
  return missingColumns(row).length > 0;
}

function missingColumns(row: DisplayTextRow): GeneratedColumn[] {
  const pinned = new Set(row.manual_field_overrides ?? []);
  return GENERATED_COLUMNS.filter((column) => !pinned.has(column) && (row[column] ?? "").trim() === "");
}

/** One generated field, its verdict, and the text it was derived from. */
export type FieldOutcome = { value: string; problems: string[] };

export type DisplayTextPreview = {
  slug: string;
  titleZh: string;
  short: FieldOutcome;
  publicTitle: FieldOutcome;
  publicSummary: FieldOutcome;
};

export type GenerateDisplayTextResult = {
  candidateCount: number;
  attemptedCount: number;
  /** Rows where at least one column was written. */
  writtenCount?: number;
  /** Per-column write counts — a prompt can be fine on two fields and broken on the third. */
  writtenByColumn?: Record<GeneratedColumn, number>;
  /** Returned by the model but refused, with reasons. A prompt failing one rule across many rows is a prompt to fix, and a bare count says nothing about which. */
  rejected?: { slug: string; column: GeneratedColumn; value: string; problems: string[] }[];
  /** Rows the model never returned, or whose write failed. */
  failedSlugs?: string[];
  lastErrorMessage?: string;
  /** Real model output for the first `sample` rows, written nowhere. */
  preview?: DisplayTextPreview[];
};

async function loadCandidates(supabase: SupabaseClient): Promise<DisplayTextRow[]> {
  const { data, error } = await supabase
    .from("tenders")
    .select("slug, title, summary, title_zh_short, title_zh_public, summary_zh_public, country, manual_field_overrides")
    .order("publication_date", { ascending: false });

  if (error) throw new Error(`读取待生成公开文案的项目失败：${error.message}`);
  return ((data ?? []) as DisplayTextRow[]).filter(needsDisplayText);
}

function toInput(row: DisplayTextRow): DisplayTextInput {
  return { slug: row.slug, titleZh: row.title.zh, summaryZh: row.summary.zh, country: row.country };
}

/**
 * Check one row's three generated strings.
 *
 * Exported so the sample path and the write path cannot drift: a preview that
 * shows text --write would refuse is reviewing the wrong thing.
 */
export function checkGenerated(
  row: Pick<DisplayTextRow, "slug" | "title">,
  generated: { titleZhShort: string; titleZhPublic: string; summaryZhPublic: string },
): DisplayTextPreview {
  return {
    slug: row.slug,
    titleZh: row.title.zh,
    short: { value: generated.titleZhShort, problems: shortTitleProblems(generated.titleZhShort, row.title.zh) },
    publicTitle: { value: generated.titleZhPublic, problems: publicTitleProblems(generated.titleZhPublic) },
    publicSummary: { value: generated.summaryZhPublic, problems: publicSummaryProblems(generated.summaryZhPublic) },
  };
}

/**
 * `sample` exists for the same reason it does in translate-all-tenders.ts.
 * A dry run counts rows and makes no model call, so without it the only way
 * to see what this prompt produces is to publish it to every page at once —
 * and these strings become the <title>, the meta description, the JSON-LD and
 * every list row on the site. Judging that after the fact, on production, is
 * the wrong order.
 */
export async function generateDisplayText(
  supabase: SupabaseClient,
  options: {
    write: boolean;
    limit?: number;
    sample?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<GenerateDisplayTextResult> {
  const candidates = await loadCandidates(supabase);
  const selected = options.limit === undefined ? candidates : candidates.slice(0, options.limit);

  if (options.sample !== undefined && options.sample > 0) {
    const rows = selected.slice(0, options.sample);
    const result: GenerateDisplayTextResult = {
      candidateCount: candidates.length,
      attemptedCount: rows.length,
    };
    try {
      const generated = await generateDisplayTextBatch(rows.map(toInput));
      const bySlug = new Map(generated.map((item) => [item.slug, item]));
      result.preview = rows.map((row) => {
        const got = bySlug.get(row.slug);
        if (got === undefined) {
          const missing: FieldOutcome = { value: "(模型没有返回这一条)", problems: ["模型没有返回"] };
          return { slug: row.slug, titleZh: row.title.zh, short: missing, publicTitle: missing, publicSummary: missing };
        }
        return checkGenerated(row, got);
      });
    } catch (err) {
      result.lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
    return result;
  }

  if (!options.write) {
    return { candidateCount: candidates.length, attemptedCount: 0 };
  }

  let writtenCount = 0;
  const writtenByColumn: Record<GeneratedColumn, number> = {
    title_zh_short: 0,
    title_zh_public: 0,
    summary_zh_public: 0,
  };
  const rejected: NonNullable<GenerateDisplayTextResult["rejected"]> = [];
  const failedSlugs: string[] = [];
  let lastErrorMessage: string | undefined;
  let done = 0;

  for (const batch of chunk(selected, BATCH_SIZE)) {
    let generated: Awaited<ReturnType<typeof generateDisplayTextBatch>> = [];
    try {
      generated = await generateDisplayTextBatch(batch.map(toInput));
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
    const bySlug = new Map(generated.map((item) => [item.slug, item]));

    // A batch can fail without throwing — the model returns fewer items than
    // it was sent. Retry only what is missing, one at a time, so one bad row
    // does not sink its batch.
    for (const row of batch.filter((candidate) => !bySlug.has(candidate.slug))) {
      try {
        const [single] = await generateDisplayTextBatch([toInput(row)]);
        if (single) bySlug.set(single.slug, single);
      } catch (err) {
        lastErrorMessage = err instanceof Error ? err.message : String(err);
      }
    }

    for (const row of batch) {
      done += 1;
      const got = bySlug.get(row.slug);
      if (got === undefined) {
        failedSlugs.push(row.slug);
        continue;
      }

      // Field by field, not row by row. The three strings have independent
      // failure modes — a public title can keep a district name while the
      // short title and the summary are both fine — and refusing the whole
      // row for one of them would either publish nothing or, worse, tempt a
      // later "just write it anyway". A refused column stays NULL, which is
      // the safe state for each of the three by construction.
      const checked = checkGenerated(row, got);
      const wanted = new Set(missingColumns(row));
      const update: Record<string, string> = {};

      const fields: [GeneratedColumn, FieldOutcome][] = [
        ["title_zh_short", checked.short],
        ["title_zh_public", checked.publicTitle],
        ["summary_zh_public", checked.publicSummary],
      ];
      for (const [column, outcome] of fields) {
        if (!wanted.has(column)) continue;
        if (outcome.problems.length > 0) {
          rejected.push({ slug: row.slug, column, value: outcome.value, problems: outcome.problems });
          continue;
        }
        update[column] = outcome.value;
      }

      if (Object.keys(update).length === 0) continue;

      const { error: updateError } = await supabase
        .from("tenders")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("slug", row.slug);

      if (updateError) {
        failedSlugs.push(row.slug);
        lastErrorMessage = updateError.message;
        continue;
      }
      writtenCount += 1;
      for (const column of Object.keys(update) as GeneratedColumn[]) writtenByColumn[column] += 1;
    }

    options.onProgress?.(done, selected.length);
  }

  return {
    candidateCount: candidates.length,
    attemptedCount: selected.length,
    writtenCount,
    writtenByColumn,
    rejected,
    failedSlugs,
    lastErrorMessage,
  };
}
