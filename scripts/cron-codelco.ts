/**
 * The daily read of Codelco's public calls, as a plain script so the GitHub
 * Actions schedule can run it. Invoked by .github/workflows/daily-ingest.yml.
 * Added 2026-09-25 with the Petronect and UPME jobs (the user: 基于你的建议做).
 *
 * Usage:
 *   npm run cron:codelco              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:codelco -- --write
 *   npm run cron:codelco -- --days 30     (a wider window, for a one-off backfill; 0 = no window)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestCodelco } from "../lib/ingestion/ingest-codelco";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { windowDaysFromArgv } from "../lib/ingestion/publication-window";

async function main() {
  const write = hasWriteFlag();
  const days = windowDaysFromArgv();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestCodelco(supabase, { write, days });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(`Codelco 表格 ${result.listedCount} 行，仍在报名期内且${days > 0 ? `近 ${days} 天发布` : "不限发布时间"} ${result.open.length} 条（更早发布、仍在报名期内 ${result.openBeforeWindowCount} 条）：`);
  for (const tender of result.open) {
    console.log(`  [${tender.relevance.tier}] ${tender.tenderNumber} 报名截止 ${tender.submissionDeadline?.slice(0, 10) ?? "—"} | ${tender.title.es.slice(0, 90)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(supabase!, "import-codelco", problem ? "failed" : "ok", problem ?? `报名期内 ${result.open.length} 条，写入 ${result.upsertedCount ?? 0} 条`);
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
