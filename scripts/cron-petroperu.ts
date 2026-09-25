/**
 * The daily read of Petroperú's international competitions, as a plain
 * script so the GitHub Actions schedule can run it. Invoked by
 * .github/workflows/daily-ingest.yml. Added 2026-09-25 (the user: Petroperú
 * <- 只导入发布 5 天以内的，截止日写「见招标文件」; only PCI calls, since the
 * CAI rows on the same list are post-award notices).
 *
 * Usage:
 *   npm run cron:petroperu              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:petroperu -- --write
 *   npm run cron:petroperu -- --days 0     (no publication window — still only open PCI calls)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestPetroperu, PETROPERU_WINDOW_DAYS } from "../lib/ingestion/ingest-petroperu";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { windowDaysFromArgv } from "../lib/ingestion/publication-window";

async function main() {
  const write = hasWriteFlag();
  const days = windowDaysFromArgv(process.argv, PETROPERU_WINDOW_DAYS);
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestPetroperu(supabase, { write, days });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(
    `Petroperú 列表第一页 ${result.listedCount} 行，其中正式招标（PCI）${result.pciCount} 行；` +
      `${days > 0 ? `近 ${days} 天发布` : "不限发布时间"}的 PCI ${result.calls.length} 个，导入 ${result.kept.length} 个：`,
  );
  for (const { call, skipReason } of result.calls) {
    console.log(`  ${skipReason ? "跳过" : "导入"} ${call.code} ${call.publishedOn} ${skipReason ?? ""} | ${call.description.slice(0, 90)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(supabase!, "import-petroperu", problem ? "failed" : "ok", problem ?? `近 ${days} 天正式招标 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条`);
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条，文件链接 ${result.linkCount ?? 0} 个。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
