/**
 * The daily read of Uruguay's ARCE OCDS feed, as a plain script so the GitHub
 * Actions schedule can run it. Added 2026-10-13, staged, and opened to
 * visitors 2026-10-14 (user: 前台+后台开放乌拉圭).
 *
 * Usage:
 *   npm run cron:uruguay                       (dry run — fetches and classifies, writes nothing)
 *   npm run cron:uruguay -- --write
 *   npm run cron:uruguay -- --days 14          (a wider window, e.g. a first backfill)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestUruguay } from "../lib/ingestion/ingest-uruguay";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function daysFlag(): number | undefined {
  const at = process.argv.indexOf("--days");
  if (at < 0) return undefined;
  const days = Number(process.argv[at + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 45) throw new Error("--days 需要 1–45 之间的整数");
  return days;
}

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestUruguay(supabase, { write, days: daysFlag() });
  console.log(`ARCE 窗口内新发布 ${result.listedCount} 条${result.failedReads.length ? `（${result.failedReads.length} 条读取失败）` : ""}，按采购方式：`);
  for (const [procedure, count] of result.byProcedure) console.log(`  ${String(count).padStart(4)}  ${procedure}`);
  console.log(`\n读取范围（公开招标 + 重点国企/部委的简易招标）${result.rows.length} 条；保留 ${result.kept.length} 条：`);
  for (const row of result.rows) {
    const tier = row.tender.relevance.tier;
    const closed = row.tender.status !== "open" ? "·已截标" : "";
    console.log(`  [${TIER_LABEL[tier] ?? tier}${closed}] ${row.tender.tenderNumber} | ${row.tender.buyer.slice(0, 40)} | ${row.tender.title.es.slice(0, 90)}`);
    if (tier === "excluded") console.log(`        排除原因：${row.tender.relevance.reason.zh.slice(0, 80)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.listedCount === 0 ? "ARCE 一条新招标都没返回（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-uruguay",
    problem ? "failed" : "ok",
    problem ?? `新发布 ${result.listedCount} 条，读取范围 ${result.rows.length} 条，保留 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条，标书链接 ${result.documentLinks ?? 0} 个`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
