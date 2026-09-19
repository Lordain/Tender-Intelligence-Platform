import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePublicTitleBatch, type PublicTitleInput } from "@/lib/ingestion/public-title-qwen";
import { publicTitleProblems } from "@/lib/public-title";
import type { LocalizedText } from "@/types/tender";

/**
 * Fill tenders.title_zh_public (migration 0053) for every row that still
 * publishes its full translated title.
 *
 * Deliberately a separate pass rather than another field on the translation
 * prompt. The translation is the product for a subscriber and has to be as
 * precise as it can be; this pass exists to throw that precision away. One
 * prompt asked to do both at once would be asked to keep and to drop the
 * same proper noun in the same breath.
 */
const BATCH_SIZE = 12;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type PublicTitleRow = {
  slug: string;
  title: LocalizedText;
  title_zh_public: string | null;
  country: string | null;
  manual_field_overrides: string[] | null;
};

/**
 * Rows worth spending a model call on.
 *
 * `title.zh === title.es` is the untranslated() mirror every mapper writes.
 * Those rows have no Chinese title to de-identify, and every public surface
 * already replaces them with 政府采购项目, so generating one would spend a
 * call to publish a placeholder — and would feed the prompt the untranslated
 * original, which is the exact text it exists to remove.
 */
export function needsPublicTitle(row: PublicTitleRow): boolean {
  if (row.title.zh.trim() === row.title.es.trim()) return false;
  if ((row.manual_field_overrides ?? []).includes("title_zh_public")) return false;
  return (row.title_zh_public ?? "").trim() === "";
}

export type GeneratePublicTitlesResult = {
  candidateCount: number;
  attemptedCount: number;
  writtenCount?: number;
  /** Returned by the model but refused by publicTitleProblems, with reasons — a prompt failing one rule across many rows is a prompt to fix, and a bare count says nothing about which. */
  rejected?: { slug: string; titleZh: string; titleZhPublic: string; problems: string[] }[];
  /** Rows the model never returned, or whose write failed. */
  failedSlugs?: string[];
  lastErrorMessage?: string;
  /** Real model output for the first `sample` rows, written nowhere. */
  preview?: { slug: string; titleZh: string; titleZhPublic: string; problems: string[] }[];
};

async function loadCandidates(supabase: SupabaseClient): Promise<PublicTitleRow[]> {
  const { data, error } = await supabase
    .from("tenders")
    .select("slug, title, title_zh_public, country, manual_field_overrides")
    .order("publication_date", { ascending: false });

  if (error) throw new Error(`读取待生成公开标题的项目失败：${error.message}`);
  return ((data ?? []) as PublicTitleRow[]).filter(needsPublicTitle);
}

function toInput(row: PublicTitleRow): PublicTitleInput {
  return { slug: row.slug, titleZh: row.title.zh, country: row.country };
}

/**
 * `sample` exists for the same reason it does in translate-all-tenders.ts.
 * A dry run counts rows and makes no model call, so without it the only way
 * to see what this prompt produces is to publish it to every page at once —
 * and this string becomes the <title>, the meta description and the JSON-LD
 * name of every public page. Judging that after the fact, on production, is
 * the wrong order.
 */
export async function generatePublicTitles(
  supabase: SupabaseClient,
  options: {
    write: boolean;
    limit?: number;
    sample?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<GeneratePublicTitlesResult> {
  const candidates = await loadCandidates(supabase);
  const selected = options.limit === undefined ? candidates : candidates.slice(0, options.limit);

  if (options.sample !== undefined && options.sample > 0) {
    const rows = selected.slice(0, options.sample);
    const result: GeneratePublicTitlesResult = {
      candidateCount: candidates.length,
      attemptedCount: rows.length,
    };
    try {
      const generated = await generatePublicTitleBatch(rows.map(toInput));
      const bySlug = new Map(generated.map((item) => [item.slug, item.titleZhPublic]));
      result.preview = rows.map((row) => {
        const titleZhPublic = bySlug.get(row.slug) ?? "(模型没有返回这一条)";
        return {
          slug: row.slug,
          titleZh: row.title.zh,
          titleZhPublic,
          // Through the same verifier the write path uses: a preview that
          // shows text --write would refuse is reviewing the wrong thing.
          problems: bySlug.has(row.slug) ? publicTitleProblems(titleZhPublic) : ["模型没有返回"],
        };
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
  const rejected: GeneratePublicTitlesResult["rejected"] = [];
  const failedSlugs: string[] = [];
  let lastErrorMessage: string | undefined;
  let done = 0;

  for (const batch of chunk(selected, BATCH_SIZE)) {
    let generated: { slug: string; titleZhPublic: string }[] = [];
    try {
      generated = await generatePublicTitleBatch(batch.map(toInput));
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
    const bySlug = new Map(generated.map((item) => [item.slug, item.titleZhPublic]));

    // A batch can fail without throwing — the model returns fewer items than
    // it was sent. Retry only what is missing, one at a time, so one bad row
    // does not sink its batch.
    for (const row of batch.filter((candidate) => !bySlug.has(candidate.slug))) {
      try {
        const [single] = await generatePublicTitleBatch([toInput(row)]);
        if (single) bySlug.set(single.slug, single.titleZhPublic);
      } catch (err) {
        lastErrorMessage = err instanceof Error ? err.message : String(err);
      }
    }

    for (const row of batch) {
      done += 1;
      const candidate = bySlug.get(row.slug);
      if (candidate === undefined) {
        failedSlugs.push(row.slug);
        continue;
      }

      // Refused rather than written. A row with no public title falls back to
      // title.zh, which is today's behaviour — while a bad one is published
      // into a <title>, a meta description and a JSON-LD name, where the
      // point was to publish something safe. Leaving it NULL costs one row's
      // de-identification; writing it costs the thing this column is for.
      const problems = publicTitleProblems(candidate);
      if (problems.length > 0) {
        rejected.push({ slug: row.slug, titleZh: row.title.zh, titleZhPublic: candidate, problems });
        continue;
      }

      const { error: updateError } = await supabase
        .from("tenders")
        .update({ title_zh_public: candidate, updated_at: new Date().toISOString() })
        .eq("slug", row.slug);

      if (updateError) {
        failedSlugs.push(row.slug);
        lastErrorMessage = updateError.message;
        continue;
      }
      writtenCount += 1;
    }

    options.onProgress?.(done, selected.length);
  }

  return {
    candidateCount: candidates.length,
    attemptedCount: selected.length,
    writtenCount,
    rejected,
    failedSlugs,
    lastErrorMessage,
  };
}
