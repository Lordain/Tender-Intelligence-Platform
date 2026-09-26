/**
 * The daily read of Metro de Santiago's announced tenders ("Próximas
 * Licitaciones"), as a plain script so the GitHub Actions schedule can run
 * it. Invoked by .github/workflows/daily-ingest.yml. Added 2026-09-26 (user:
 * 智利圣地亚哥地铁「即将招标」自动导入，需要备注是预告即将招标).
 *
 * Usage:
 *   npm run cron:metro-santiago              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:metro-santiago -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestMetroSantiago } from "../lib/ingestion/ingest-metro-santiago";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestMetroSantiago(supabase, { write });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(`圣地亚哥地铁招标预告表 ${result.listedCount} 行，其中新线路/大型系统、尚未过期的 ${result.upcoming.length} 条：`);
  for (const tender of result.upcoming) console.log(`  [${tender.relevance.tier}] ${tender.title.es.slice(0, 100)}`);

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(supabase!, "import-metro-santiago", problem ? "failed" : "ok", problem ?? `预告 ${result.upcoming.length} 条，写入 ${result.upsertedCount ?? 0} 条，移除过期预告 ${result.removedSlugs?.length ?? 0} 条`);
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (result.removedSlugs?.length) console.log(`移除已不在预告表中的：${result.removedSlugs.join("、")}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
