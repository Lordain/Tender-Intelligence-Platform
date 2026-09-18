/**
 * The daily PEMEX pull, as a plain script. Invoked by
 * .github/workflows/daily-ingest.yml.
 *
 * PEMEX publishes through seven separate SharePoint lists, one per
 * subsidiary. ALL SEVEN run every day here — which is the whole reason this
 * moved off Vercel. As a serverless route it had to work under a 42-second
 * budget with the list order rotating by day, so a given subsidiary was only
 * reached every few days; nothing was lost (the recency window is wider than
 * a rotation) but a tender could sit unimported for days for no better reason
 * than a request timeout.
 *
 * One list failing must not cost the other six, so each is caught
 * individually and the run reports which ones failed.
 *
 * Usage:
 *   npm run cron:pemex              (dry run)
 *   npm run cron:pemex -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { importPemexLive } from "../lib/ingestion/import-pemex-live";
import { PEMEX_LIST_TITLES, KNOWN_BUYER_NAMES } from "../lib/ingestion/pemex-sources";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

/**
 * One month, matching Colombia's and the admin forms' own default.
 *
 * Was 2. The user set the rule after finding months-old rows in the admin
 * list (2026-09-13): 自动跑考虑最近一个月就可以，不用考虑好几个月. A
 * scheduled run happens every night, so a window wider than the gap between
 * runs only re-reads rows it has already seen — it buys nothing and costs a
 * longer run and more rows for a person to read.
 */
const RECENCY_MONTHS = 1;

async function main() {
  const write = hasWriteFlag();

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  let upserted = 0;
  const errors: string[] = [];
  const writeFailures: string[] = [];

  for (const [index, listTitle] of PEMEX_LIST_TITLES.entries()) {
    const buyer = KNOWN_BUYER_NAMES[listTitle];
    console.log(`\n=== ${index + 1}/${PEMEX_LIST_TITLES.length} ${listTitle} ===`);
    if (!buyer) {
      // Every list has a buyer name today; a new one added without one would
      // otherwise be imported under an empty buyer.
      errors.push(`${listTitle}: 没有对应的采购单位名称（KNOWN_BUYER_NAMES）`);
      console.error(`  跳过——没有对应的采购单位名称。`);
      continue;
    }
    try {
      const result = await importPemexLive(listTitle, buyer, { write, months: RECENCY_MONTHS });
      upserted += result.upsertedCount ?? 0;
      console.log(
        `  ${buyer}：列表 ${result.totalItems} 条，映射 ${result.mappedCount} 条，` +
          `近 ${RECENCY_MONTHS} 个月 ${result.keptAfterRecencyCount} 条，写入 ${result.upsertedCount ?? 0} 条。`,
      );
      if (result.documentLinks) {
        console.log(`  附件链接：${result.documentLinks.tenders} 条项目 / ${result.documentLinks.links} 个链接（${result.documentLinks.failedItems} 个失败）。`);
      }
      for (const f of result.failed ?? []) writeFailures.push(f.slug);
    } catch (error) {
      // One subsidiary's list being down must not cost the other six.
      errors.push(`${listTitle}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`  失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failedRun = errors.length > 0 || writeFailures.length > 0;
  await writeCronHeartbeat(
    supabase,
    "import-pemex",
    failedRun ? "failed" : "ok",
    failedRun
      ? `${errors.length} 个列表出错，${writeFailures.length} 条写入失败`
      : `${PEMEX_LIST_TITLES.length} 个列表，新增/更新 ${upserted} 条`,
  );

  if (failedRun) {
    console.error(`\n有失败：`);
    for (const e of errors) console.error(`  ${e}`);
    if (writeFailures.length > 0) console.error(`  ${writeFailures.length} 条写入失败，例如 ${writeFailures.slice(0, 3).join("、")}`);
    process.exit(1);
  }
  console.log(`\n完成：${PEMEX_LIST_TITLES.length} 个列表，新增/更新 ${upserted} 条。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
