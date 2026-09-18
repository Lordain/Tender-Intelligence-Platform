/**
 * The daily SECOP II pull, as a plain script so a scheduler outside Next can
 * run it. Invoked by .github/workflows/daily-ingest.yml.
 *
 * Two passes, and the second one is the reason this is not just "import":
 *
 *  1. DISCOVER — `ingestColombia` over a one-month publication window. The
 *     connector applies its own server-side `%icitaci%` filter, so a real
 *     30-day window is ~550 rows. A month rather than a day because
 *     datos.gov.co lags the portal by days (see the publish-to-visible
 *     measurement in lib/ingestion/README.md) — a daily window would miss
 *     exactly the tenders that arrive late, and re-reading a month is cheap.
 *
 *  2. REFRESH — `refreshColombiaTenders`, which re-reads the tenders we
 *     ALREADY track by reference, with no date filter at all. This is what
 *     moves a tender to 已中标, fills a submission deadline SECOP published
 *     after we first saw the row, and picks up an awarded provider.
 *     Discovery alone never updates a tender it already has.
 *
 * Documents are deliberately NOT fetched. Downloading bid documents is
 * minutes of work and hundreds of megabytes, and the user's own call on the
 * PEMEX corpus was that they are not worth pulling wholesale — it stays an
 * explicit action on /admin/documents-needed.
 *
 * Usage:
 *   npm run cron:colombia              (dry run — fetches and maps, writes nothing)
 *   npm run cron:colombia -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestColombia, refreshColombiaTenders } from "../lib/ingestion/ingest-colombia";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const DISCOVER_MONTHS = 1;
const DISCOVER_MAX_PAGES = 5;

async function main() {
  const write = hasWriteFlag();

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  console.log(`=== 1/2 拉取新标（最近 ${DISCOVER_MONTHS} 个月）===`);
  const discovered = await ingestColombia(supabase, {
    months: DISCOVER_MONTHS,
    maxPages: DISCOVER_MAX_PAGES,
    write,
    fetchDocuments: false,
  });
  console.log(
    `  源头 ${discovered.fetchedCount} 行，映射 ${discovered.mappedCount} 条，` +
      `近 ${DISCOVER_MONTHS} 个月 ${discovered.keptAfterRecencyCount} 条，写入 ${discovered.upsertedCount ?? 0} 条` +
      `（排除 ${discovered.skippedExcludedCount ?? 0}，此前手动删除 ${discovered.skippedManuallyDeletedCount ?? 0}）。`,
  );

  console.log(`\n=== 2/2 刷新已有标书状态 ===`);
  const refreshed = await refreshColombiaTenders(supabase, { write });
  console.log(
    `  已跟踪 ${refreshed.trackedCount} 条，源头回查 ${refreshed.fetchedCount} 行，` +
      `其中属于我们的 ${refreshed.mappedCount} 条，更新 ${refreshed.upsertedCount ?? 0} 条。`,
  );

  const failed = [...(discovered.failed ?? []), ...(refreshed.failed ?? [])];

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  await writeCronHeartbeat(
    supabase,
    "import-colombia",
    failed.length > 0 ? "failed" : "ok",
    failed.length > 0
      ? `${failed.length} 条写入失败`
      : `新增/更新 ${discovered.upsertedCount ?? 0} 条，刷新 ${refreshed.upsertedCount ?? 0} 条`,
  );

  if (failed.length > 0) {
    console.error(`\n${failed.length} 条写入失败：`);
    for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
    process.exit(1);
  }
  console.log(`\n完成。`);
}

main().catch((error) => {
  console.error(error);
  // The heartbeat is deliberately NOT written as "failed" here: a throw this
  // early usually means Supabase itself was unreachable, in which case the
  // write would fail too. An absent heartbeat ages into the same overdue
  // warning within 30 hours, which is the honest signal.
  process.exit(1);
});
