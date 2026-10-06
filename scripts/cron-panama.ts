/**
 * The daily read of Panama's PanamaCompra, as a plain script so the GitHub
 * Actions schedule can run it. Invoked by .github/workflows/daily-ingest.yml.
 * Added 2026-10-06. Panama is STAGED (lib/staged-countries.ts): what this
 * writes shows in the admin pages only.
 *
 * Usage:
 *   npm run cron:panama                       (dry run — fetches and classifies, writes nothing)
 *   npm run cron:panama -- --write
 *   npm run cron:panama -- --days 30 --write  (a backfill; the first --write run does this by itself)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { PANAMA_SOURCE_NAME, ingestPanama } from "../lib/ingestion/ingest-panama";
import { windowDaysFromArgv } from "../lib/ingestion/publication-window";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  // The first run backfills 30 days on its own: the daily window is 3 days
  // of STATUS CHANGES, so a call published two weeks before Panama was added
  // and still open would otherwise never be read. 30 days took ~15 minutes
  // in the 2026-10-06 trial (589 pliegos), inside the job's 40.
  let days = windowDaysFromArgv();
  if (write && !process.argv.includes("--days")) {
    const { count, error } = await supabase!.from("tenders").select("id", { count: "exact", head: true }).eq("source_name", PANAMA_SOURCE_NAME);
    if (error) throw new Error(`读取已入库的巴拿马项目失败：${error.message}`);
    if ((count ?? 0) === 0) {
      days = 30;
      console.log("库里还没有巴拿马项目：这次回补近 30 天。");
    }
  }
  if (days < 1 || days > 90) throw new Error("--days 需要 1–90 之间的整数");

  const result = await ingestPanama(supabase, { write, days, log: (line) => console.log(line) });
  console.log(
    `\nPanamaCompra 近 ${days} 天有状态变化的正式招标 ${result.listedCount} 条，仍在进行 ${result.liveCount} 条（详情失败 ${result.detailErrors} 条）；保留 ${result.kept.length} 条：`,
  );
  for (const tender of result.kept) {
    const usd = tender.estimatedValue !== undefined ? ` · US$${Math.round(tender.estimatedValue).toLocaleString("en-US")}` : "";
    console.log(`  [${TIER_LABEL[tender.relevance.tier] ?? tender.relevance.tier}] ${tender.tenderNumber}${usd} | ${tender.title.es.slice(0, 90)}`);
  }
  if (result.truncatedTypes.length > 0) console.log(`\n翻页到上限、可能不全：${result.truncatedTypes.join("、")}`);

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem =
    result.listedCount === 0
      ? "PanamaCompra 一条都没返回（见日志）"
      : result.liveCount > 0 && result.detailErrors === result.liveCount
        ? "详情一条都没读到（见日志）"
        : failed.length > 0
          ? `${failed.length} 条写入失败`
          : null;
  await writeCronHeartbeat(
    supabase!,
    "import-panama",
    problem ? "failed" : "ok",
    problem ?? `状态变化 ${result.listedCount} 条，进行中 ${result.liveCount} 条，保留 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条，状态更新 ${result.statusUpdates ?? 0} 条（未公开）`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条，状态更新 ${result.statusUpdates ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
