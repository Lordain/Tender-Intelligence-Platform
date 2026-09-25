/**
 * The daily Petrobras / Transpetro pull from Petronect, as a plain script so
 * the GitHub Actions schedule can run it. Invoked by
 * .github/workflows/daily-ingest.yml. Added 2026-09-25 (the user: 基于你的建议做
 * — deepen the site with oil, power and mining companies' own tenders).
 *
 * One request reads every opportunity open for bids; see
 * lib/ingestion/connectors/petronect-live.ts for the door and
 * lib/relevance-petronect.ts for which ones are kept and why.
 *
 * Usage:
 *   npm run cron:petronect              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:petronect -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestPetronect } from "../lib/ingestion/ingest-petronect";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

async function main() {
  const write = hasWriteFlag();

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestPetronect(supabase, { write }, (message) => console.log(`  ${message}`));

  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  const tiers = result.tierCounts;
  console.log(
    `在招 ${result.fetchedCount} 个（国际招标 ${result.internationalCount} 个），` +
      `进入推荐 ${result.kept.length} 个（大型 ${tiers.flagship}、中型 ${tiers.significant}、常规 ${tiers.standard}），排除 ${tiers.excluded} 个。`,
  );
  for (const tender of [...result.kept].sort((a, b) => a.relevance.tier.localeCompare(b.relevance.tier))) {
    console.log(`  [${tender.relevance.tier}] ${tender.tenderNumber} 截止 ${tender.submissionDeadline?.slice(0, 10) ?? "—"} | ${tender.title.es.slice(0, 110)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  console.log(
    `\n写入 ${result.upsertedCount ?? 0} 条；交标期不足 12 天未写入 ${result.skippedShortWindowCount ?? 0} 条；` +
      `已截止未写入 ${result.skippedClosedCount ?? 0} 条；标书链接 ${result.documentLinks?.linkCount ?? 0} 个（${result.documentLinks?.tendersWithLinks ?? 0} 个项目）。`,
  );
  await writeCronHeartbeat(
    supabase!,
    "import-petronect",
    problem ? "failed" : "ok",
    problem ?? `新增/更新 ${result.upsertedCount ?? 0} 条，排除 ${result.skippedExcludedCount ?? 0} 条`,
  );

  if (failed.length > 0) {
    console.error(`\n${failed.length} 条写入失败：`);
    for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  }
  if (problem) process.exit(1);
  console.log(`\n完成。`);
}

main().catch((error) => {
  console.error(error);
  // No "failed" heartbeat here, for the reason cron-colombia.ts gives: a
  // throw this early usually means Supabase itself was unreachable.
  process.exit(1);
});
