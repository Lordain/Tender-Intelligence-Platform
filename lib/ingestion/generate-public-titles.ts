import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDisplayTextBatch, type DisplayTextInput } from "@/lib/ingestion/public-title-qwen";
import { publicSummaryProblems, publicTitleProblems, shortTitleProblems } from "@/lib/public-title";
import { stripUnverifiedParentheticals } from "@/lib/ingestion/translate-titles";
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
/**
 * Deliberately larger than translate-all-tenders.ts's 8, which is NOT an
 * oversight to copy.
 *
 * That 8 was set after a real run truncated a 25-item batch, because a
 * translation's output is as long as the source summary and a few
 * multi-paragraph specs in one batch blow the cap. This pass has the opposite
 * shape: every field it returns is hard-capped by its own validator (60 / 25
 * / 100 characters), so twenty rows is about 4k tokens of output no matter
 * what comes in.
 *
 * What the small batch cost was the system prompt, which is ~2,800 tokens and
 * is re-sent on every call. At 8 a 300-row run spent ~106k tokens restating
 * the rules and ~17k on the actual rows; at 20 that first number is ~42k. The
 * per-item retry below still covers the one risk a bigger batch adds — a
 * model returning fewer items than it was sent.
 */
const BATCH_SIZE = 20;

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
  return columnsToFill(row).length > 0;
}

/**
 * Why a stored value would not be written today, or [] if it still passes.
 *
 * The same three validators the write path runs, pointed at the column
 * instead of at the model's reply.
 */
function storedProblems(row: DisplayTextRow, column: GeneratedColumn): string[] {
  const value = (row[column] ?? "").trim();
  if (value === "") return [];
  // Through the same haystack checkGenerated builds, and that matters more
  // than it looks: this function decides what gets RE-generated, and the
  // write path clears a stored value whose replacement is also refused. A
  // narrower haystack here would read good stored titles as broken, clear
  // them, and fall every one of them back to the administrative title.
  if (column === "title_zh_short") return shortTitleProblems(value, row.title.zh, generatorSourceText(row));
  if (column === "title_zh_public") return publicTitleProblems(value);
  return publicSummaryProblems(value);
}

/**
 * The columns this row still needs — empty ones, AND ones holding text that
 * the current rules would no longer accept.
 *
 * The second half is what makes tightening a rule actionable. When 原文未列明
 * 具体设备 became a rejection (SOURCE_META in lib/public-title.ts, 2026-09-20)
 * there were already a hundred rows carrying exactly that sentence, published
 * as their meta description. Without this they would have sat there until
 * someone hand-wrote an UPDATE … SET summary_zh_public = NULL, because a pass
 * that only fills blanks can never fix what it wrote when its own rules were
 * looser. With it, re-running the same button is the fix.
 *
 * Pinned columns are still excluded: manual_field_overrides means a human
 * decided, and a validator does not get to overrule that.
 */
function columnsToFill(row: DisplayTextRow): GeneratedColumn[] {
  const pinned = new Set(row.manual_field_overrides ?? []);
  return GENERATED_COLUMNS.filter((column) => {
    if (pinned.has(column)) return false;
    return (row[column] ?? "").trim() === "" || storedProblems(row, column).length > 0;
  });
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
  /**
   * Per-column counts of values set back to NULL: a stored string that no
   * longer passes and whose replacement did not pass either. Reported
   * separately from writes because it is the opposite outcome — a page that
   * loses its generated text and falls back — and a run that clears a lot is
   * a prompt still failing the rule that selected those rows.
   */
  clearedByColumn?: Record<GeneratedColumn, number>;
  /** Returned by the model but refused, with reasons. A prompt failing one rule across many rows is a prompt to fix, and a bare count says nothing about which. */
  rejected?: { slug: string; column: GeneratedColumn; value: string; problems: string[] }[];
  /** Rows the model never returned, or whose write failed. */
  failedSlugs?: string[];
  lastErrorMessage?: string;
  /** Real model output for the first `sample` rows, written nowhere. */
  preview?: DisplayTextPreview[];
};

/** Same 1000-row-per-request PostgREST cap every other full-table scan in this codebase pages around (see lib/db/tenders.ts's SUPABASE_PAGE_SIZE comment). */
const PAGE_SIZE = 1000;

async function loadCandidates(supabase: SupabaseClient): Promise<DisplayTextRow[]> {
  const rows: DisplayTextRow[] = [];

  // Paged. An unranged select stops silently at 1000 rows, and this one is
  // ordered newest-first, so the truncation is invisible in exactly the
  // workflow this function is built for: the newest rows DO come back, the run
  // looks right, and `candidateCount` quietly under-reports while everything
  // older than the newest thousand becomes permanently unreachable.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, summary, title_zh_short, title_zh_public, summary_zh_public, country, manual_field_overrides")
      // Newest IMPORTED first, not newest published. `limit` exists so a run
      // can be kept to "the rows that arrived since last time", and
      // publication_date answers a different question: a tender published in
      // August but imported yesterday sorts near the bottom by that key and a
      // --limit 100 run would miss exactly the row that needs this most.
      //
      // `slug` breaks ties: created_at alone is not unique across a bulk
      // import, and .range() paging over a non-deterministic order can repeat
      // or skip rows between requests.
      .order("created_at", { ascending: false })
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`读取待生成公开文案的项目失败：${error.message}`);
    const page = (data ?? []) as DisplayTextRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows.filter(needsDisplayText);
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
/**
 * Everything the generator was shown for this row, as one haystack.
 *
 * Must stay in step with toInput() — a validator that checks the model
 * against less than the prompt gave it reports copying as invention. See the
 * `sourceZh` note on shortTitleProblems.
 */
function generatorSourceText(row: Pick<DisplayTextRow, "title" | "summary">): string {
  return `${row.title.zh}\n${row.summary.zh}`;
}

export function checkGenerated(
  row: Pick<DisplayTextRow, "slug" | "title" | "summary">,
  generated: { titleZhShort: string; titleZhPublic: string; summaryZhPublic: string },
): DisplayTextPreview {
  // Strip a Latin parenthetical the full title does not contain, rather than
  // refusing the whole short title over it (2026-09-20). Three of six
  // rejections in a real 100-row run were this, all Peru:
  //
  //   卡鲁阿帕塔（Carhuapata）HU-712乡村道路桥梁翻新
  //   阿亚瓦卡区（Ayavaca）7个聚居区农村饮水与卫生改善扩建
  //   帕乌卡坦博区（Paucartambo）帕乌卡坦博河护岸改善
  //
  // The rule is right to fire: an unverified spelling is a guess, and one of
  // those three proves it — Peru's province is Ayabaca, not Ayavaca, so the
  // model invented a plausible misspelling that would have been published as
  // a matching key against the bid documents. But refusing the row is the
  // wrong remedy. The Chinese is correct and the rest of the title is good;
  // only the guessed spelling has to go, and without it each of these is a
  // perfectly usable short title. Refusing instead falls the column back to
  // the full administrative title, which serves the member worse.
  //
  // Same function and the same reasoning as the translation pass, which meets
  // this problem first and solves it this way (translate-titles.ts). The
  // haystack is every Chinese string the prompt was given — title AND summary
  // — because a parenthetical here must be copied verbatim from one of them;
  // this pass never re-translates. It was the title alone until 2026-09-20:
  // see the `sourceZh` note on shortTitleProblems for the run that showed
  // what checking against less than the prompt saw costs.
  const source = generatorSourceText(row);
  const shortTitle = stripUnverifiedParentheticals(generated.titleZhShort, source).trim();
  return {
    slug: row.slug,
    titleZh: row.title.zh,
    short: { value: shortTitle, problems: shortTitleProblems(shortTitle, row.title.zh, source) },
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
  const clearedByColumn: Record<GeneratedColumn, number> = {
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
      const wanted = new Set(columnsToFill(row));
      const update: Record<string, string | null> = {};

      const fields: [GeneratedColumn, FieldOutcome][] = [
        ["title_zh_short", checked.short],
        ["title_zh_public", checked.publicTitle],
        ["summary_zh_public", checked.publicSummary],
      ];
      for (const [column, outcome] of fields) {
        if (!wanted.has(column)) continue;
        if (outcome.problems.length > 0) {
          rejected.push({ slug: row.slug, column, value: outcome.value, problems: outcome.problems });
          // A refused replacement for a column that was EMPTY leaves it empty,
          // which is the safe state. A refused replacement for a column that
          // was selected because what it holds no longer passes is different:
          // doing nothing republishes the bad text on every page it feeds.
          // So clear it and let the reader fall back — to the placeholder for
          // the summary, to title.zh for the two titles — until a later run
          // produces something the rules accept.
          if (storedProblems(row, column).length > 0) {
            update[column] = null;
            clearedByColumn[column] += 1;
          }
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
      for (const [column, value] of Object.entries(update) as [GeneratedColumn, string | null][]) {
        if (value !== null) writtenByColumn[column] += 1;
      }
    }

    options.onProgress?.(done, selected.length);
  }

  return {
    candidateCount: candidates.length,
    attemptedCount: selected.length,
    writtenCount,
    writtenByColumn,
    clearedByColumn,
    rejected,
    failedSlugs,
    lastErrorMessage,
  };
}
