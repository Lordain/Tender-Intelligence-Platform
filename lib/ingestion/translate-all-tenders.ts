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
import type { TenderToTranslate, TranslatedTender } from "@/lib/ingestion/translate-titles";
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
  /** Most recent real error message from a failed API call, if any — callers (the admin API route) use this to log an admin_alerts row when translation is failing systemically (quota/connection), not just per one bad row. */
  lastErrorMessage?: string;
  sample: { slug: string; titleEs: string }[];
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

export async function translateAllTenders(
  supabase: SupabaseClient,
  options: { write: boolean; limit?: number },
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

  if (!options.write) return result;

  let translatedCount = 0;
  let failedCount = 0;
  const failedSlugs: string[] = [];
  let lastErrorMessage: string | undefined;

  for (const batch of chunk(toTranslate, BATCH_SIZE)) {
    const input: TenderToTranslate[] = batch.map((t) => ({ slug: t.slug, titleEs: t.title.es, summaryEs: t.summary.es }));

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
        const [single] = await translateTenderBatchQwen([{ slug: tender.slug, titleEs: tender.title.es, summaryEs: tender.summary.es }]);
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
      if (needsTitle(tender)) update.title = { ...tender.title, zh: translated.titleZh };
      if (needsSummary(tender)) update.summary = { ...tender.summary, zh: translated.summaryZh };

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
    }
  }

  return { ...result, translatedCount, failedCount, failedSlugs, lastErrorMessage };
}
