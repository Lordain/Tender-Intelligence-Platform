/**
 * The daily read of Chile's public-works concessions — the MOP Dirección
 * General de Concesiones' "Proyectos en Licitación". Added 2026-10-10 (user,
 * after the 11-country source review: 智利 MOP 特许经营 OK). Invoked by
 * .github/workflows/daily-ingest.yml.
 *
 * Usage:
 *   npm run cron:chile-concesiones              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:chile-concesiones -- --write
 *   npm run cron:chile-concesiones -- --days 0 --write   (one-off: every project still before its offer date)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestChileConcesiones } from "../lib/ingestion/ingest-chile-concesiones";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { windowDaysFromArgv } from "../lib/ingestion/publication-window";
import { convertToUsd } from "../lib/currency";
import type { Tender } from "../types/tender";

function line(tender: Tender): string {
  const usd = tender.estimatedValue !== undefined ? convertToUsd(tender.estimatedValue, tender.currency) : null;
  const amount = usd !== null ? `约 US$ ${(usd / 1_000_000).toFixed(0)}M` : "金额未公布";
  return `  [${tender.relevance.tier}] ${tender.title.es} | ${amount} | 交标 ${tender.submissionDeadline?.slice(0, 10) ?? "—"} | 发布 ${tender.publicationDate.slice(0, 10)}`;
}

async function main() {
  const write = hasWriteFlag();
  const days = windowDaysFromArgv();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestChileConcesiones(supabase, { write, days });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  const closed = result.projects.length - result.open.length - result.openBeforeWindow.length;
  console.log(`特许经营总局列出 ${result.projects.length} 个项目；仍未截标 ${result.open.length + result.openBeforeWindow.length} 个，已过交标日 ${closed} 个。`);
  console.log(`${days > 0 ? `近 ${days} 天发布` : "不限发布时间"}、本次会写入的 ${result.open.length} 个：`);
  for (const tender of result.open) console.log(line(tender));
  if (result.openBeforeWindow.length > 0) {
    console.log(`更早发布、仍未截标的 ${result.openBeforeWindow.length} 个（加 --days 0 才写入）：`);
    for (const tender of result.openBeforeWindow) console.log(line(tender));
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(supabase!, "import-chile-concesiones", problem ? "failed" : "ok", problem ?? `未截标 ${result.open.length + result.openBeforeWindow.length} 个，写入 ${result.upsertedCount ?? 0} 个`);
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 个。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
