/**
 * The daily read of the Dominican Republic's DGCP open-data API, as a plain
 * script so the GitHub Actions schedule can run it. Invoked by
 * .github/workflows/daily-ingest.yml. Added 2026-10-04, staged, and opened to
 * visitors the same day.
 *
 * Usage:
 *   npm run cron:dominicana                       (dry run — fetches and classifies, writes nothing)
 *   npm run cron:dominicana -- --write
 *   npm run cron:dominicana -- --days 30          (a wider window, e.g. a first backfill)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestDominicana } from "../lib/ingestion/ingest-dominicana";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function daysFlag(): number | undefined {
  const at = process.argv.indexOf("--days");
  if (at < 0) return undefined;
  const days = Number(process.argv[at + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("--days 需要 1–90 之间的整数");
  return days;
}

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestDominicana(supabase, { write, days: daysFlag() });
  console.log(`DGCP 窗口内发布 ${result.listedCount} 条，其中公开招标 ${result.publicTenderCount} 条；保留 ${result.kept.length} 条：`);
  for (const row of result.rows) {
    const tier = row.tender.relevance.tier;
    const usd = row.tender.estimatedValue !== undefined ? ` · ${row.tender.currency} ${Math.round(row.tender.estimatedValue).toLocaleString("en-US")}` : "";
    console.log(`  [${TIER_LABEL[tier] ?? tier}${row.tender.status !== "open" ? "·已截标" : ""}] ${row.proceso.codigo_proceso}${usd} | ${row.tender.title.es.slice(0, 90)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.listedCount === 0 ? "DGCP 接口一条都没返回（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-dominicana",
    problem ? "failed" : "ok",
    problem ?? `发布 ${result.listedCount} 条，公开招标 ${result.publicTenderCount} 条，保留 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条，标书链接 ${result.documentLinks ?? 0} 个`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
