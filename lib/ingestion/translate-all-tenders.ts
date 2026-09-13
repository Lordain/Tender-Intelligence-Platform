/**
 * Core logic behind `npm run translate:tenders` (scripts/translate-
 * tenders.ts) and the "翻译所有标题" button on the admin "新项目清单"
 * page — shared so the CLI and the web form translate through exactly
 * the same path. See translate-titles-qwen.ts for the actual es->zh model
 * call this drives (Qwen3.6-Plus via DashScope, batched).
 *
 * Was Claude Haiku 4.5 (translate-titles.ts) until 2026-09-08, when the
 * user moved this path to Qwen. Both modules keep the same signature over
 * TenderToTranslate/TranslatedTender, so switching back is this import
 * line; scripts/compare-translation-providers.ts still runs both.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripUnverifiedParentheticals, titleIsTruncated, type TenderToTranslate, type TranslatedTender } from "@/lib/ingestion/translate-titles";
import { translateTenderBatchQwen } from "@/lib/ingestion/translate-titles-qwen";
import type { LocalizedText } from "@/types/tender";

// Was 25 — dropped after a real run (2026-09-03) truncated a 25-item
// batch's output (max_tokens: 8000 in translate-titles.ts) when a few
// items in the batch fell back to Descripción (a long multi-paragraph
// spec) as their summary. A smaller batch keeps worst-case per-call
// output well under the cap even when several long summaries land in
// the same batch. Kept at 8 through the move to Qwen, which sets no
// max_tokens of its own and so relies on DashScope's default cap —
// unmeasured, and not worth probing with a bigger batch.
const BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type TranslateAllTendersResult = {
  totalNonExcluded: number;
  untranslatedCount: number;
  attemptedCount: number;
  translatedCount?: number;
  failedCount?: number;
  failedSlugs?: string[];
  /** Slugs this run actually wrote, so the batch can be handed to reset-translations.ts as a batch. */
  writtenSlugs?: string[];
  /** Most recent real error message from a failed API call, if any — callers (the admin API route) use this to log an admin_alerts row when translation is failing systemically (quota/connection), not just per one bad row. */
  lastErrorMessage?: string;
  sample: { slug: string; titleEs: string }[];
  /** Real model output for the first `sample` rows, written nowhere — see the `sample` option. */
  preview?: { slug: string; titleEs: string; titleZh: string; summaryEs: string; summaryZh: string }[];
};

type TranslatableRow = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  manual_field_overrides: string[] | null;
};

/**
 * Untranslated = exactly the untranslated() mirror every mapper writes
 * (zh === es, byte for byte) — a real translation always differs from the
 * Spanish original — AND not a field an admin edited by hand
 * (manual_field_overrides, migration 0032).
 *
 * Decided per field, not per row (2026-09-11). One flag on the title used to
 * decide both, which was wrong in both directions:
 *
 *   - a row whose title was still Spanish but whose summary a human had
 *     written in Chinese was picked up, and the write below replaced BOTH —
 *     silently destroying the hand-written summary;
 *   - a row whose title a human had translated was skipped entirely, so its
 *     Spanish summary never got translated at all.
 *
 * The manual_field_overrides half matters because this path does not go
 * through the importer's protection: it writes the columns directly. An
 * admin who rewrote a machine translation into better Chinese has a title
 * where zh !== es, so the first test already spares it — but one who
 * corrected it back to something that happens to match the Spanish (a
 * proper noun, a bare tender number) would lose the edit without this.
 */
function needsTitle(row: TranslatableRow): boolean {
  return row.title.zh === row.title.es && !(row.manual_field_overrides ?? []).includes("title");
}

function needsSummary(row: TranslatableRow): boolean {
  return row.summary.zh === row.summary.es && !(row.manual_field_overrides ?? []).includes("summary");
}

/**
 * `sample` closes a real gap in how this gets verified.
 *
 * A dry run counts rows and makes no API call, so the only way to see what
 * the model actually produces was to write it — to every row, on the live
 * site, at once. The titles are the product here (the homepage column is
 * literally headed 中文项目名称), and Spanish procurement prose is full of
 * things a general translator gets wrong: entity acronyms, "5/A. SECCIÓN",
 * road and plant designations. Judging that after the fact, on production, is
 * the wrong order.
 *
 * With `sample: n` and `write: false` this translates the first n rows for
 * real and returns them for inspection, writing nothing.
 */
export async function translateAllTenders(
  supabase: SupabaseClient,
  options: {
    write: boolean;
    limit?: number;
    sample?: number;
    /**
     * Called after each written batch. A --write run is a sequence of
     * blocking model calls with nothing printed between them, so without
     * this a long run is indistinguishable from a hung one — and the full
     * set is ~31 batches.
     */
    onProgress?: (doneCount: number, total: number) => void;
  },
): Promise<TranslateAllTendersResult> {
  // PostgREST caps an unranged select at 1000 rows — page with .range()
  // so tenders past the first 1000 don't silently get skipped.
  const PAGE_SIZE = 1000;
  const rows: TranslatableRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, summary, manual_field_overrides")
      .neq("relevance_tier", "excluded")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch tenders: ${error.message}`);

    const page = data as TranslatableRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const untranslated = rows.filter((t) => needsTitle(t) || needsSummary(t));
  const toTranslate = options.limit !== undefined ? untranslated.slice(0, options.limit) : untranslated;

  const result: TranslateAllTendersResult = {
    totalNonExcluded: rows.length,
    untranslatedCount: untranslated.length,
    attemptedCount: toTranslate.length,
    sample: toTranslate.slice(0, 5).map((t) => ({ slug: t.slug, titleEs: t.title.es })),
  };

  if (!options.write) {
    if (!options.sample || options.sample <= 0) return result;
    const rowsToPreview = toTranslate.slice(0, options.sample);
    try {
      const translated = await translateTenderBatchQwen(
        rowsToPreview.map((t) => ({
          slug: t.slug,
          titleEs: t.title.es,
          summaryEs: t.summary.es,
          titleIsTruncated: titleIsTruncated(t.title.es, t.summary.es),
        })),
      );
      const bySlug = new Map(translated.map((r) => [r.slug, r]));
      // Through the same verifier the write path uses: a preview that shows
      // text --write would not store is reviewing the wrong thing.
      result.preview = rowsToPreview.map((t) => {
        const source = `${t.title.es}\n${t.summary.es}`;
        const got = bySlug.get(t.slug);
        return {
          slug: t.slug,
          titleEs: t.title.es,
          titleZh: got ? stripUnverifiedParentheticals(got.titleZh, source) : "(模型没有返回这一条)",
          summaryEs: t.summary.es,
          summaryZh: got ? stripUnverifiedParentheticals(got.summaryZh, source) : "(模型没有返回这一条)",
        };
      });
    } catch (err) {
      result.lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
    return result;
  }

  let translatedCount = 0;
  let failedCount = 0;
  const failedSlugs: string[] = [];
  const writtenSlugs: string[] = [];
  let lastErrorMessage: string | undefined;

  for (const batch of chunk(toTranslate, BATCH_SIZE)) {
    const input: TenderToTranslate[] = batch.map((t) => ({
      slug: t.slug,
      titleEs: t.title.es,
      summaryEs: t.summary.es,
      titleIsTruncated: titleIsTruncated(t.title.es, t.summary.es),
    }));

    let results: TranslatedTender[];
    try {
      results = await translateTenderBatchQwen(input);
    } catch (err) {
      results = [];
      lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
    const bySlug = new Map(results.map((r) => [r.slug, r]));

    // A batch can also fail without throwing — the model returns fewer
    // items than sent. Retry only what's missing, one item at a time, so
    // a single bad row doesn't sink its whole batch.
    const missing = batch.filter((t) => !bySlug.has(t.slug));
    for (const tender of missing) {
      try {
        const [single] = await translateTenderBatchQwen([{
          slug: tender.slug,
          titleEs: tender.title.es,
          summaryEs: tender.summary.es,
          titleIsTruncated: titleIsTruncated(tender.title.es, tender.summary.es),
        }]);
        if (single) bySlug.set(tender.slug, single);
      } catch (err) {
        lastErrorMessage = err instanceof Error ? err.message : String(err);
      }
    }

    for (const tender of batch) {
      const translated = bySlug.get(tender.slug);
      if (!translated) {
        failedCount++;
        failedSlugs.push(tender.slug);
        continue;
      }

      // Only the fields that actually needed it. The model is asked for both
      // (it reads better with the title for context) but whichever one a
      // human already owns is never written back.
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      // Checked against BOTH fields: a title rebuilt from the summary names
      // places that appear only there, and those parentheses are as correct
      // as any other.
      const source = `${tender.title.es}\n${tender.summary.es}`;
      if (needsTitle(tender)) update.title = { ...tender.title, zh: stripUnverifiedParentheticals(translated.titleZh, source) };
      if (needsSummary(tender)) update.summary = { ...tender.summary, zh: stripUnverifiedParentheticals(translated.summaryZh, source) };

      const { error: updateError } = await supabase
        .from("tenders")
        .update(update)
        .eq("slug", tender.slug);

      if (updateError) {
        failedCount++;
        failedSlugs.push(tender.slug);
        continue;
      }
      translatedCount++;
      writtenSlugs.push(tender.slug);
    }

    options.onProgress?.(translatedCount + failedCount, toTranslate.length);
  }

  return { ...result, translatedCount, failedCount, failedSlugs, writtenSlugs, lastErrorMessage };
}
