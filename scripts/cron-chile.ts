/**
 * The daily Chilean pull, as a plain script so the GitHub Actions schedule
 * can run it. Invoked by .github/workflows/daily-ingest.yml. Added 2026-09-25
 * when the user opened Chile (筛选调好 → 现在开放).
 *
 * Reads Mercado Público's public search (the busca door) rather than the
 * OCDS export: the export has published nothing since 2026-07-29, while the
 * search serves tenders the day they are published. That door carries no
 * stability promise, which is why a zero-row or long-stale result writes a
 * FAILED heartbeat instead of passing quietly — see describeBuscaStaleness.
 *
 * Each run reads every open tender (the search returns them all in ~15
 * requests) and keeps those published in the last three days — the same
 * window as the company sources (user, 2026-09-25: 智利每日自动导入的范围 <-
 * 1–3 天; it had been two months). Three rather than one so a failed day is
 * caught by the next run. The upsert is keyed on slug, and a row the user
 * deleted stays deleted (tender_manual_deletions). Closing dates come from
 * each kept tender's own ficha, one request per row at
 * CHILE_FICHA_REQUEST_SPACING_MS. ENRICH_LIMIT is a ceiling against a rule
 * change that suddenly keeps thousands, not a target.
 *
 * Usage:
 *   npm run cron:chile              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:chile -- --write
 *   npm run cron:chile -- --days 1 --write    (another window in days)
 *   npm run cron:chile -- --days 0 --write    (the old two-month window, for a one-off backfill)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestChile } from "../lib/ingestion/ingest-chile";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { COMPANY_SOURCE_WINDOW_DAYS, windowDaysFromArgv } from "../lib/ingestion/publication-window";

/** Only for `--days 0`: the two-month window the daily job used before 2026-09-25. */
const WINDOW_MONTHS = 2;
const ENRICH_LIMIT = 300;

async function main() {
  const write = hasWriteFlag();
  // --days 0 = the old two-month window.
  const days = windowDaysFromArgv(process.argv, COMPANY_SOURCE_WINDOW_DAYS);

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestChile(
    supabase,
    { write, door: "busca", months: WINDOW_MONTHS, ...(days > 0 ? { days } : {}), enrichLimit: ENRICH_LIMIT, preview: false },
    (message) => console.log(`  ${message}`),
  );

  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  const tiers = result.tierCounts;
  console.log(
    `源头 ${result.fetchedCount} 行，${days > 0 ? `近 ${days} 天` : `近 ${WINDOW_MONTHS} 个月`} ${result.keptAfterRecencyCount} 条，` +
      `进入推荐 ${result.surfacedCount ?? 0} 条（大型 ${tiers?.flagship ?? 0}、中型 ${tiers?.significant ?? 0}、常规 ${tiers?.standard ?? 0}），` +
      `补到交标截止日 ${result.enrichedCount ?? 0} 条。`,
  );

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase,
    "import-chile",
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
