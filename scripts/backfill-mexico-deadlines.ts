/**
 * CLI wrapper around lib/ingestion/backfill-mexico-deadlines.ts — see that
 * file for the real logic and for why an economic opening never supplies a
 * deadline. This only handles argv, the Supabase client and the printout.
 *
 * The same function backs the admin 「补交标截止日」 button
 * (app/admin/import-tenders/mexico/), so a preview in the browser and a dry
 * run here can never disagree.
 *
 * Usage:
 *   npm run backfill:mx-deadlines                   (dry run — prints what it would do, writes nothing)
 *   npm run backfill:mx-deadlines -- --write         (fills the column + syncs the timeline)
 *   npm run backfill:mx-deadlines -- --country Peru  (inspect only — --write is refused outside Mexico)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { backfillMexicoDeadlines } from "../lib/ingestion/backfill-mexico-deadlines";
import { KEY_DATE_TYPE_LABELS } from "../lib/tender-labels";

const RULE = "─".repeat(78);
const day = (value: string | null | undefined) => value?.slice(0, 10) ?? "—";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const country = argValue(args, "--country") ?? "Mexico";

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  let result;
  try {
    result = await backfillMexicoDeadlines(supabase, { write, country });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(RULE);
  console.log(`${result.country}：${result.totalMissing} 个项目没有交标截止日。`);

  for (const candidate of result.candidates) {
    console.log(`\n${RULE}\n${candidate.slug}${candidate.sourceName ? `  (${candidate.sourceName})` : ""}`);
    console.log(`  ${candidate.title}`);
    console.log(`  发布 ${day(candidate.publicationDate)}   现有日期 ${candidate.keyDates.length} 条   已存标书 ${candidate.documentCount} 份   已知下载链接 ${candidate.documentLinkCount} 个`);
    for (const row of candidate.keyDates) {
      console.log(`    ${day(row.date)}  ${KEY_DATE_TYPE_LABELS[row.type].zh.padEnd(6, "　")}  [${row.origin}]${row.label ? `  ${row.label}` : ""}`);
    }
    if (candidate.fill) {
      console.log(`  → 交标截止日可填 ${day(candidate.fill.date)}（依据：${candidate.fill.basis}）${candidate.outcome === "written" ? "  ✓ 已写入" : ""}`);
      if (candidate.outcome === "failed") console.log(`  ✗ 写入失败：${candidate.error}`);
    } else {
      console.log(
        `  → 填不了：${candidate.blocked === "economic_only" ? "只有商务标开标——那是交标之后的第二场，不能当截止日" : "没有开标日期可依据"}`,
      );
    }
  }

  console.log(`\n${RULE}`);
  console.log(`可填 ${result.fillableCount} 个，填不了 ${result.stuckCount} 个。`);

  const stuck = result.candidates.filter((candidate) => !candidate.fill);
  if (stuck.length > 0) {
    console.log("\n这些需要人工补（打开链接，把日程粘进编辑页的粘贴框，或者先跑标书分析）：");
    for (const candidate of stuck) {
      console.log(`  ${candidate.slug}`);
      console.log(`    ${candidate.sourceUrl ?? "（没有来源链接）"}`);
    }
  }

  if (!result.write) {
    console.log("\n空跑（加 --write 才会写库）——什么都没改。");
    return;
  }
  console.log(`\n已写入 ${result.writtenCount} 个项目的交标截止日${result.failedCount > 0 ? `，${result.failedCount} 个失败` : ""}，并同步了关键日期时间线。`);
}

main();
