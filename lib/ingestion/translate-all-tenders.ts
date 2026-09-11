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

export async function translateAllTenders(
  supabase: SupabaseClient,
  options: { write: boolean; limit?: number },
): Promise<TranslateAllTendersResult> {
  // PostgREST caps an unranged select at 1000 rows — page with .range()
  // so tenders past the first 1000 don't silently get skipped.
  const PAGE_SIZE = 1000;
  const rows: { slug: string; title: LocalizedText; summary: LocalizedText; country: string; submission_deadline: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, summary, country, submission_deadline")
      .neq("relevance_tier", "excluded")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch tenders: ${error.message}`);

    const page = data as { slug: string; title: LocalizedText; summary: LocalizedText; country: string; submission_deadline: string | null }[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  // Untranslated = exactly the untranslated() mirror every mapper writes
  // (title.zh === title.es, byte for byte) — a real translation always
  // differs from the Spanish original.
  //
  // Also skips a Colombia tender with no submission deadline (2026-09-05,
  // explicit request) — same rule as fetchAllTendersFromDb()/
  const untranslated = rows.filter((t) => t.title.zh === t.title.es);
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

      const { error: updateError } = await supabase
        .from("tenders")
        .update({
          title: { ...tender.title, zh: translated.titleZh },
          summary: { ...tender.summary, zh: translated.summaryZh },
          updated_at: new Date().toISOString(),
        })
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
