/**
 * CLI wrapper around lib/ingestion/generate-public-titles.ts — fills the three
 * derived display columns in one pass:
 *
 *   title_zh_short    (0054) the condensed title MEMBERS see in lists and as
 *                     the detail-page heading. Keeps the place and its
 *                     full-width parenthesis; drops the procurement shell.
 *   title_zh_public   (0053) the de-identified title GUESTS and crawlers see.
 *   summary_zh_public (0054) the de-identified summary GUESTS and crawlers see.
 *
 * Why the public pair exists, in one line: our translation prompt deliberately
 * keeps the source proper noun in full-width parentheses (马塔德罗（Matadero）
 * 泵站) so a subscriber can match a title against the bid documents — which
 * makes title.zh the best search key back to the official notice anywhere on
 * this platform, and summary.zh a paraphrase that restates it. See
 * lib/public-title.ts.
 *
 * Nothing here overwrites title.zh or summary.zh. Clearing the three columns
 * returns the site to its previous behaviour.
 *
 * Requires DASHSCOPE_API_KEY and Supabase service-role credentials.
 *
 * Usage:
 *   npm run titles:public                          (dry run — counts only, no API calls)
 *   npm run titles:public -- --sample 20           (generates 20 for real and PRINTS them, writes nothing)
 *   npm run titles:public -- --limit 200 --write   (generates up to 200 and writes)
 *   npm run titles:public -- --write               (every row still missing one of the three)
 *
 * Read the --sample output before any --write. These strings become every
 * list row, the <title>, the meta description and the JSON-LD of every public
 * page, so the public pair is both the de-identification AND the thing those
 * pages rank on. A prompt that over-strips ("墨西哥 工程项目" on every row) is
 * as bad as one that under-strips: it is safe and it ranks for nothing.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { generateDisplayText, type DisplayTextPreview } from "../lib/ingestion/generate-public-titles";
import { hasWriteFlag } from "@/lib/cli-write-flag";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const COLUMN_LABELS: Record<string, string> = {
  title_zh_short: "短标题",
  title_zh_public: "公开标题",
  summary_zh_public: "公开摘要",
};

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
  if (shouldWrite) console.log("每批 8 条，每批一次模型调用，几十秒不等——中途没有输出是正常的。\n");

  const result = await generateDisplayText(supabase, {
    write: shouldWrite,
    limit: limitArg ? Number(limitArg) : undefined,
    sample: sampleArg ? Number(sampleArg) : undefined,
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });

  console.log(`\n还没有生成公开文案的项目：${result.candidateCount} 条`);

  const preview = result.preview;
  if (preview) {
    console.log(`\n样本（${preview.length} 条，未写入）：\n`);
    for (const row of preview) {
      const mark = (problems: string[]) => (problems.length === 0 ? "  ✓" : `  ✗ ${problems.join("；")}`);
      console.log(`${"─".repeat(78)}`);
      console.log(`  翻译原文（不展示，仅留库）  ${row.titleZh}`);
      console.log(`  订阅用户标题                ${row.short.value}`);
      console.log(mark(row.short.problems));
      console.log(`  访客标题                    ${row.publicTitle.value}`);
      console.log(mark(row.publicTitle.problems));
      console.log(`  访客摘要                    ${row.publicSummary.value}`);
      console.log(mark(row.publicSummary.problems));
      console.log("");
    }
    // Per field, not per row. A prompt can be fine on two of the three and
    // broken on the last, and a single blended percentage hides exactly that.
    const rate = (pick: (row: DisplayTextPreview) => string[]) =>
      `${preview.filter((row) => pick(row).length === 0).length}/${preview.length}`;
    console.log(`${"─".repeat(78)}`);
    console.log(`可发布：订阅标题 ${rate((r) => r.short.problems)}、访客标题 ${rate((r) => r.publicTitle.problems)}、访客摘要 ${rate((r) => r.publicSummary.problems)}`);
    console.log("任何一项低于九成就先改提示词，不要 --write。");
    if (result.lastErrorMessage) console.error(`\n调用出错：${result.lastErrorMessage}`);
  }

  if (result.writtenCount !== undefined) {
    console.log(`\n写入了 ${result.writtenCount} 行`);
    if (result.writtenByColumn) {
      for (const [column, count] of Object.entries(result.writtenByColumn)) {
        console.log(`  ${COLUMN_LABELS[column] ?? column}：${count} 条`);
      }
    }
  }

  const clearedTotal = Object.values(result.clearedByColumn ?? {}).reduce((sum, count) => sum + count, 0);
  if (clearedTotal > 0) {
    // A column that held text the current rules refuse, whose replacement was
    // refused too. Leaving it would republish the bad text; clearing it falls
    // back (placeholder for the summary, title.zh for the two titles) until a
    // later run produces something acceptable.
    console.log(`\n清空了 ${clearedTotal} 条不再合规的存量文案（回落到默认值，等下次重试）`);
    for (const [column, count] of Object.entries(result.clearedByColumn ?? {})) {
      if (count > 0) console.log(`  ${COLUMN_LABELS[column] ?? column}：${count} 条`);
    }
  }

  if (result.rejected && result.rejected.length > 0) {
    console.log(`\n被拒绝（该列保持为空，沿用回退值）：${result.rejected.length} 项`);
    for (const row of result.rejected.slice(0, 20)) {
      console.log(`  ${row.slug} · ${COLUMN_LABELS[row.column] ?? row.column}`);
      console.log(`    ${row.value}`);
      console.log(`    ${row.problems.join("；")}`);
    }
    if (result.rejected.length > 20) console.log(`  …另有 ${result.rejected.length - 20} 项`);
  }

  if (result.failedSlugs && result.failedSlugs.length > 0) {
    console.log(`\n模型没有返回或写入失败：${result.failedSlugs.length} 条`);
  }

  if (result.lastErrorMessage && !preview) {
    console.log(`\n最近一次错误：${result.lastErrorMessage}`);
  }

  if (!shouldWrite && !preview) {
    console.log("\n这是空跑，没有调用模型。加 --sample 20 先看看效果，确认后再 --write。");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
