/**
 * The daily read of Colombia's UPME transmission calls, as a plain script so
 * the GitHub Actions schedule can run it. Invoked by
 * .github/workflows/daily-ingest.yml. Added 2026-09-25 with the Petronect job
 * (the user: 基于你的建议做).
 *
 * Usage:
 *   npm run cron:upme              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:upme -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestUpme } from "../lib/ingestion/ingest-upme";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestUpme(supabase, { write });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(`UPME 标为开放/预公告 ${result.taggedCount} 条，仍可投标 ${result.kept.length} 条：`);
  for (const { call, skipReason } of result.calls) {
    console.log(`  ${skipReason ? "跳过" : "导入"} ${call.number.padEnd(17)} ${call.grid} ${call.publishedOn ?? "—"} ${skipReason ?? ""} | ${call.title.slice(0, 80)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条，文件链接 ${result.linkCount ?? 0} 个。`);
  await writeCronHeartbeat(supabase!, "import-upme", problem ? "failed" : "ok", problem ?? `可投标 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条`);
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
