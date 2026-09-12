/**
 * The LicitIA half of the daily ingestion, as ONE command, so a scheduler has
 * a single thing to call.
 *
 * The heaviest of the three: discovery downloads LicitIA's bulk corpus (15
 * lotes, ~372k rows) and then makes one detail lookup per newly-discovered
 * procedure, and link resolution is one sequential HTTP request per unresolved
 * tender. Minutes of work — it never fit a serverless function's request
 * ceiling at any plan, and it is the reason the whole daily ingest moved to
 * .github/workflows/daily-ingest.yml.
 *
 * Both steps run even if the first one fails: link resolution operates on
 * tenders ALREADY in the database and has nothing to do with whether today's
 * discovery worked. The process still exits non-zero if either failed, so the
 * scheduler reports red.
 *
 * Usage:
 *   npm run licitia:daily              (dry run — reports, writes nothing)
 *   npm run licitia:daily -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { discoverComprasMxVigente } from "../lib/ingestion/discover-comprasmx-vigente";
import { resolveComprasMxLinks } from "../lib/ingestion/resolve-comprasmx-links";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";

const DISCOVER_MONTHS = 2;

async function main() {
  const write = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const problems: string[] = [];
  const notes: string[] = [];

  console.log(`\n=== 1/2 发现新标书（LicitIA vigente，最近 ${DISCOVER_MONTHS} 个月）===`);
  try {
    const discovered = await discoverComprasMxVigente(supabase, { write, months: DISCOVER_MONTHS });
    console.log(
      `  源头 vigente ${discovered.vigenteCount} 条，其中库里没有的 ${discovered.newCount} 条，` +
        `映射成功 ${discovered.mappedCount} 条，近 ${DISCOVER_MONTHS} 个月 ${discovered.keptAfterRecencyCount} 条，` +
        `写入 ${discovered.upsertedCount ?? 0} 条。`,
    );
    if (discovered.excludedCsvPath) console.log(`  被排除的清单：${discovered.excludedCsvPath}`);
    const failed = discovered.failed ?? [];
    if (failed.length > 0) problems.push(`发现新标书：${failed.length} 条写入失败（例如 ${failed.slice(0, 3).map((f) => f.slug).join("、")}）`);
    notes.push(`新增/更新 ${discovered.upsertedCount ?? 0} 条`);
  } catch (error) {
    problems.push(`发现新标书失败：${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  }

  console.log(`\n=== 2/2 回填 Compras MX 详情页链接 ===`);
  try {
    const resolved = await resolveComprasMxLinks(supabase, { write });
    console.log(
      `  待回填 ${resolved.candidateCount} 条，成功 ${resolved.resolvedCount} 条，` +
        `源头查不到 ${resolved.notFoundCount} 条，出错 ${resolved.errorCount} 条。`,
    );
    if (resolved.errorCount > 0) problems.push(`链接回填：${resolved.errorCount} 条出错`);
    notes.push(`回填链接 ${resolved.resolvedCount} 条`);
  } catch (error) {
    problems.push(`链接回填失败：${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  await writeCronHeartbeat(supabase, "licitia-daily", problems.length > 0 ? "failed" : "ok", problems.length > 0 ? problems.join("；") : notes.join("，"));

  if (problems.length > 0) {
    console.error(`\n有 ${problems.length} 处失败：`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`\n完成：${notes.join("，")}。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
