/**
 * The daily read of Argentina's four sources — COMPR.AR, CONTRAT.AR, ADIF and
 * the Boletín Oficial — as a plain script so the GitHub Actions schedule can
 * run it. Invoked by .github/workflows/daily-ingest.yml. Added 2026-09-27.
 * Argentina is STAGED (lib/staged-countries.ts): what this writes shows in
 * the admin pages only.
 *
 * Usage:
 *   npm run cron:argentina                        (dry run — fetches and classifies, writes nothing)
 *   npm run cron:argentina -- --write
 *   npm run cron:argentina -- --only adif,boletin (some sources only)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ARGENTINA_SOURCE_LABELS, ARGENTINA_SOURCES, ingestArgentina } from "../lib/ingestion/ingest-argentina";
import type { ArgentinaSourceId } from "../lib/ingestion/argentina-import-result";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function onlyFlag(): ArgentinaSourceId[] | undefined {
  const at = process.argv.indexOf("--only");
  if (at < 0) return undefined;
  const wanted = (process.argv[at + 1] ?? "").split(",").map((id) => id.trim());
  const valid = wanted.filter((id): id is ArgentinaSourceId => (ARGENTINA_SOURCES as string[]).includes(id));
  if (valid.length === 0) throw new Error(`--only 需要 ${ARGENTINA_SOURCES.join(",")} 中的一个或几个`);
  return valid;
}

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestArgentina(supabase, { write, sources: onlyFlag() });
  for (const source of result.sources) {
    console.log(
      `\n${ARGENTINA_SOURCE_LABELS[source.id]}（${source.seconds.toFixed(0)} 秒）` +
        (source.error
          ? `\n  ❌ 整个来源失败：${source.error}`
          : `\n  列出 ${source.listed} 条，读取 ${source.mapped} 条，保留 ${source.kept} 条，跳过 ${source.skipped} 条` +
            (source.failures.length > 0 ? `，${source.failures.length} 条读取失败` : "")),
    );
    for (const failure of source.failures.slice(0, 5)) console.log(`    ⚠ ${failure.ref} —— ${failure.error}`);
  }
  console.log(`\n保留 ${result.kept.length} 条：`);
  for (const row of result.rows.filter((entry) => entry.tender.relevance.tier !== "excluded")) {
    const tender = row.tender;
    console.log(`  [${TIER_LABEL[tender.relevance.tier]}] ${row.source} ${tender.tenderNumber} | ${tender.title.es.slice(0, 90)} | ${tender.buyer.slice(0, 50)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const brokenSources = result.sources.filter((source) => source.error);
  // One unreachable source does not fail the job: from the GitHub runner the
  // Boletín Oficial's name did not resolve (EAI_AGAIN, twice on 2026-09-28)
  // while the other three answered. It is named in the heartbeat message the
  // admin page shows; the job fails when a write fails or nothing was read.
  const problem = failed.length > 0 ? `${failed.length} 条写入失败` : null;
  const partial = brokenSources.length > 0 ? `；${brokenSources.map((source) => source.id).join("、")} 未能读取` : "";
  await writeCronHeartbeat(
    supabase!,
    "import-argentina",
    problem ? "failed" : "ok",
    problem ?? `${result.sources.map((source) => `${source.id} ${source.kept}`).join("，")}；写入 ${result.upsertedCount ?? 0} 条（未公开）${partial}`,
  );
  for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条，文件链接 ${result.documentLinks ?? 0} 个。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
