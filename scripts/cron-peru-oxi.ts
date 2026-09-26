/**
 * The daily ProInversión Obras por Impuestos run, as a plain script so the
 * GitHub Actions schedule can run it. Invoked by
 * .github/workflows/daily-ingest.yml. Added 2026-09-26 (user: 如果要人工确认
 * 太麻烦了，特别是项目多了后 / 自动&手动，刷新标书状态).
 *
 * Two steps, and the second is why this exists:
 *
 *  1. IMPORT — the in-process export (En Proceso), exactly what the admin
 *     秘鲁 tab's OxI button does: new convocatorias come in, and every one
 *     still in process is re-written with its current dates. A suspended
 *     convocatoria that has resumed is back in this export, so this is also
 *     where it gets its new schedule.
 *  2. STATUS — the all-states export, against every OxI tender stored here:
 *     暂停中 when ProInversión suspends one, back to 招标中 when it resumes,
 *     已中标 / 流标 / 已取消 when it ends. See refreshPeruOxiStatuses.
 *
 * Step 2 runs even if step 1 fails; they read different exports.
 *
 * Usage:
 *   npm run cron:peru-oxi              (dry run — fetches and compares, writes nothing)
 *   npm run cron:peru-oxi -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestPeruOxi, refreshPeruOxiStatuses } from "../lib/ingestion/ingest-peru";
import { describeStatusRefresh } from "../lib/ingestion/status-refresh";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { STATUS_LABELS } from "@/lib/tender-labels";
import type { TenderStatus } from "@/types/tender";

const LABELS = Object.fromEntries(Object.entries(STATUS_LABELS).map(([status, label]) => [status, label.zh])) as Record<TenderStatus, string>;

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const problems: string[] = [];
  let importSummary = "";
  try {
    const result = await ingestPeruOxi(supabase, { write }, (message) => console.log(`  ${message}`));
    importSummary = `在办 ${result.fetchedCount} 条，写入 ${result.upsertedCount ?? 0} 条`;
    console.log(`\n① 在办清单：${result.fetchedCount} 行，可展示 ${result.surfacedCount} 条${write ? `，写入 ${result.upsertedCount ?? 0} 条` : "（试运行）"}。`);
    if (result.duplicateTenderNumbers?.length) {
      console.log(`  ⚠ 同一编号出现多次：${result.duplicateTenderNumbers.map((d) => `${d.tenderNumber}×${d.count}`).join("，")}`);
    }
    if (result.failed?.length) {
      problems.push(`${result.failed.length} 条写入失败`);
      for (const f of result.failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
    }
  } catch (error) {
    problems.push(`在办清单读取失败：${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  }

  let statusSummary = "";
  try {
    const refresh = await refreshPeruOxiStatuses(supabase, { write }, (message) => console.log(`  ${message}`));
    console.log(`\n② 全部状态清单：${refresh.exportRows} 行，状态分布 ${JSON.stringify(refresh.states)}`);
    for (const line of describeStatusRefresh(refresh, LABELS)) console.log(line);
    statusSummary = `状态变化 ${refresh.changes.length} 条`;
    if (refresh.failed) problems.push(refresh.failed);
  } catch (error) {
    problems.push(`状态刷新失败：${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。${problems.length ? `\n问题：${problems.join("；")}` : ""}`);
    if (problems.length) process.exit(1);
    return;
  }

  const problem = problems.join("；") || null;
  await writeCronHeartbeat(supabase, "import-peru-oxi", problem ? "failed" : "ok", problem ?? [importSummary, statusSummary].filter(Boolean).join("，"));
  if (problem) {
    console.error(`\n${problem}`);
    process.exit(1);
  }
  console.log("\n完成。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
