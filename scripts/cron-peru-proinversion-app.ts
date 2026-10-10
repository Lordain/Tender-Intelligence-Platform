/**
 * The daily read of ProInversión's APP concursos — Peru's public-private
 * partnerships, which never reach SEACE. Added 2026-10-10 (user, after the
 * 11-country source review: 秘鲁 APP 项目库 OK). Invoked by
 * .github/workflows/daily-ingest.yml.
 *
 * Usage:
 *   npm run cron:peru-app              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:peru-app -- --write
 *   npm run cron:peru-app -- --days 0 --write   (one-off: every concurso under way, whenever it was called)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestPeruProinversionApp } from "../lib/ingestion/ingest-peru-proinversion-app";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { windowDaysFromArgv } from "../lib/ingestion/publication-window";
import type { Tender } from "../types/tender";

function line(tender: Tender): string {
  const amount = tender.estimatedValue !== undefined ? `US$ ${(tender.estimatedValue / 1_000_000).toFixed(0)}M` : "金额未公布";
  const award = /Buena pro prevista: ([^.]+)\./.exec(tender.summary.es)?.[1] ?? "—";
  return `  [${tender.relevance.tier}] ${tender.title.es} | ${amount} | 招标公告 ${tender.publicationDate.slice(0, 10)} | 预计授标 ${award}`;
}

async function main() {
  const write = hasWriteFlag();
  const days = windowDaysFromArgv();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestPeruProinversionApp(supabase, { write, days });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(`ProInversión APP 项目库 ${result.portfolioCount} 个项目；交易阶段、未授标 ${result.underWayCount} 个。`);
  if (result.notCalled.length > 0) console.log(`其中还没有招标公告日期的：${result.notCalled.join("、")}`);
  console.log(`${days > 0 ? `近 ${days} 天发布招标公告` : "不限发布时间"}、本次会写入的 ${result.open.length} 个：`);
  for (const tender of result.open) console.log(line(tender));
  if (result.openBeforeWindow.length > 0) {
    console.log(`更早发布、仍在进行的 ${result.openBeforeWindow.length} 个（加 --days 0 才写入）：`);
    for (const tender of result.openBeforeWindow) console.log(line(tender));
  }
  console.log("（判为 excluded 的不会写入。）");

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-peru-app",
    problem ? "failed" : "ok",
    problem ?? `进行中 ${result.open.length + result.openBeforeWindow.length} 个，写入 ${result.upsertedCount ?? 0} 个，更新状态 ${result.statusChanges?.length ?? 0} 个`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (result.statusChanges?.length) console.log(`更新状态：${result.statusChanges.map((change) => `${change.slug} → ${change.status}`).join("、")}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 个。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
