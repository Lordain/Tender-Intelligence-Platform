/**
 * The daily read of Guyana's eprocure.gov.gy, as a plain script so the GitHub
 * Actions schedule can run it. Invoked by .github/workflows/daily-ingest.yml.
 * Added 2026-09-27. Guyana is STAGED (lib/staged-countries.ts): what this
 * writes shows in the admin pages only.
 *
 * Reads each notice with poppler's `pdftotext` (the daily job installs it),
 * or with pdf.js where it is not installed — see guyana-eprocure-live.ts.
 *
 * Usage:
 *   npm run cron:guyana              (dry run — fetches and classifies, writes nothing)
 *   npm run cron:guyana -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestGuyana } from "../lib/ingestion/ingest-guyana";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestGuyana(supabase, { write });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(`eprocure.gov.gy 在招 ${result.listedCount} 条，读到公告文字 ${result.readNoticeCount} 条；保留（大型工程/大宗采购）${result.kept.length} 条：`);
  for (const row of result.rows) {
    const tier = row.tender.relevance.tier;
    const how = row.facts.competition === "international" ? "国际招标" : row.facts.competition === "national" ? "国内招标" : "公告未写明招标方式或读不出";
    console.log(
      `  [${TIER_LABEL[tier] ?? tier}] ${row.opportunity.projectId} ${how}${row.factsFrom === "sibling" ? "（按同项目其他标段）" : ""}${row.facts.financier ? ` · ${row.facts.financier}` : ""} | ${row.tender.title.es.slice(0, 90)}`,
    );
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回可用数据或公告读不出（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-guyana",
    problem ? "failed" : "ok",
    problem ?? `在招 ${result.listedCount} 条，保留大型 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条（未公开）`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
