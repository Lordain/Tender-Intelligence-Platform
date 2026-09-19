/**
 * CLI wrapper around lib/ingestion/generate-public-titles.ts — fills
 * tenders.title_zh_public (migration 0053), the de-identified Chinese title
 * shown to guests, crawlers and search snippets.
 *
 * Why the column exists, in one line: our translation prompt deliberately
 * keeps the source proper noun in full-width parentheses (马塔德罗
 * （Matadero）泵站) so a subscriber can match a title against the bid
 * documents — which makes title.zh the best search key back to the official
 * notice anywhere on this platform. See lib/public-title.ts.
 *
 * Requires DASHSCOPE_API_KEY and Supabase service-role credentials.
 *
 * Usage:
 *   npm run titles:public                          (dry run — counts only, no API calls)
 *   npm run titles:public -- --sample 20           (generates 20 for real and PRINTS them, writes nothing)
 *   npm run titles:public -- --limit 200 --write   (generates up to 200 and writes)
 *   npm run titles:public -- --write               (every row that still publishes its full title)
 *
 * Read the --sample output before any --write. This string becomes the
 * <title>, the meta description and the JSON-LD name of every public page,
 * so it is both the de-identification AND the thing those pages rank on. A
 * prompt that over-strips ("墨西哥 工程项目" on every row) is as bad as one
 * that under-strips: it is safe and it ranks for nothing.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { generatePublicTitles } from "../lib/ingestion/generate-public-titles";
import { hasWriteFlag } from "@/lib/cli-write-flag";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = hasWriteFlag();
  const limitArg = argValue(args, "--limit");
  const sampleArg = argValue(args, "--sample");

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY isn't set. See .env.example.");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Printed before the first model call: each batch blocks for tens of
  // seconds with nothing in between, and a silent terminal is how a working
  // run gets killed for looking stuck.
  if (shouldWrite) console.log("每批 12 条，每批一次模型调用，几十秒不等——中途没有输出是正常的。\n");

  const result = await generatePublicTitles(supabase, {
    write: shouldWrite,
    limit: limitArg ? Number(limitArg) : undefined,
    sample: sampleArg ? Number(sampleArg) : undefined,
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });

  console.log(`\n还没有公开标题的项目：${result.candidateCount} 条`);

  if (result.preview) {
    console.log(`\n样本（${result.preview.length} 条，未写入）：\n`);
    for (const row of result.preview) {
      console.log(`  订阅用户看到：${row.titleZh}`);
      console.log(`  访客看到：    ${row.titleZhPublic}`);
      console.log(row.problems.length === 0 ? "  ✓ 可发布\n" : `  ✗ 会被拒绝：${row.problems.join("；")}\n`);
    }
    const clean = result.preview.filter((row) => row.problems.length === 0).length;
    console.log(`可发布 ${clean}/${result.preview.length}。低于九成就先改提示词，不要 --write。`);
  }

  if (result.writtenCount !== undefined) {
    console.log(`已写入：${result.writtenCount} 条`);
  }

  if (result.rejected && result.rejected.length > 0) {
    console.log(`\n被拒绝（未写入，这些行继续沿用完整标题）：${result.rejected.length} 条`);
    for (const row of result.rejected.slice(0, 20)) {
      console.log(`  ${row.slug}`);
      console.log(`    ${row.titleZhPublic}`);
      console.log(`    ${row.problems.join("；")}`);
    }
    if (result.rejected.length > 20) console.log(`  …另有 ${result.rejected.length - 20} 条`);
  }

  if (result.failedSlugs && result.failedSlugs.length > 0) {
    console.log(`\n模型没有返回或写入失败：${result.failedSlugs.length} 条`);
  }

  if (result.lastErrorMessage) {
    console.log(`\n最近一次错误：${result.lastErrorMessage}`);
  }

  if (!shouldWrite && !result.preview) {
    console.log("\n这是空跑，没有调用模型。加 --sample 20 先看看效果，确认后再 --write。");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
