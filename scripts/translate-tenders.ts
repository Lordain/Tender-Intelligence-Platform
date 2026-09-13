/**
 * CLI wrapper around lib/ingestion/translate-all-tenders.ts — see that
 * file's header for what this actually does (es->zh title/summary
 * translation on Qwen3.6-Plus, batched, for every non-excluded tender still
 * showing an untranslated() mirror). The admin "新项目清单" page's
 * "翻译所有标题" button does the same thing through a web form instead
 * of the terminal, via the same shared function.
 *
 * Skips tenders whose relevance_tier is "excluded" — no point spending
 * real API cost translating tenders the default feed never shows.
 *
 * Requires DASHSCOPE_API_KEY.
 *
 * Usage:
 *   npm run translate:tenders                          (dry run — counts only, no API calls)
 *   npm run translate:tenders -- --sample 5             (translates 5 for real and PRINTS them, writes nothing)
 *   npm run translate:tenders -- --limit 50 --write     (translates up to 50 and writes to Supabase)
 *   npm run translate:tenders -- --write                (translates every untranslated, non-excluded tender)
 *
 * Read the --sample output before any --write. The titles are the product —
 * the homepage column is headed 中文项目名称 — and Spanish procurement prose
 * is full of things a general translator mangles: entity acronyms,
 * "5/A. SECCIÓN", road and plant designations. Judging that after the fact,
 * on the live site, is the wrong order.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { translateAllTenders } from "../lib/ingestion/translate-all-tenders";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const limitArg = argValue(args, "--limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const sampleArg = argValue(args, "--sample");
  const sample = sampleArg ? Number(sampleArg) : undefined;

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY isn't set. See .env.example.");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await translateAllTenders(supabase, { write: shouldWrite, limit, sample });

  console.log(`${result.untranslatedCount} of ${result.totalNonExcluded} non-excluded tenders still need translation.`);
  console.log(`Translating ${result.attemptedCount}...`);

  if (!shouldWrite) {
    if (result.preview) {
      for (const item of result.preview) {
        console.log(`\n${"─".repeat(78)}\n${item.slug}`);
        console.log(`  标题 ES  ${item.titleEs}`);
        console.log(`  标题 ZH  ${item.titleZh}`);
        console.log(`  摘要 ES  ${item.summaryEs.slice(0, 200)}${item.summaryEs.length > 200 ? "…" : ""}`);
        console.log(`  摘要 ZH  ${item.summaryZh.slice(0, 200)}${item.summaryZh.length > 200 ? "…" : ""}`);
      }
      if (result.lastErrorMessage) console.error(`\n调用出错：${result.lastErrorMessage}`);
      console.log(`\n${"─".repeat(78)}`);
      console.log(`以上 ${result.preview.length} 条是真实模型输出，一个字都没有写进数据库。`);
      console.log(`读完觉得可以，再跑 --limit 50 --write 小批量写入。`);
      return;
    }
    console.log(JSON.stringify(result.sample, null, 2));
    if (result.attemptedCount > result.sample.length) console.log(`\n...and ${result.attemptedCount - result.sample.length} more.`);
    console.log("\n试运行——没有调用 API，什么都没写。加 --sample 5 可以看几条真实译文。");
    return;
  }

  if (result.failedSlugs && result.failedSlugs.length > 0) {
    console.error(`Failed to translate: ${result.failedSlugs.join(", ")}`);
  }
  console.log(`Done. Translated ${result.translatedCount} of ${result.attemptedCount} tenders (${result.failedCount} failed).`);
}

main();
