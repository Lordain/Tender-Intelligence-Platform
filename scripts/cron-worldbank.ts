/**
 * The daily read of the World Bank's procurement notices for every platform
 * country, as a plain script so the GitHub Actions schedule can run it.
 * Invoked by .github/workflows/daily-ingest.yml. Added 2026-10-09 (user:
 * 每天自动读取 9 国加玻利维亚的世界银行招标，经过比对后 OK). See
 * lib/ingestion/ingest-worldbank.ts.
 *
 * Usage:
 *   npm run cron:worldbank                        (dry run — reads, compares, writes nothing)
 *   npm run cron:worldbank -- --write
 *   npm run cron:worldbank -- --days 120 --write  (a backfill; the first --write run does this by itself)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { WORLDBANK_SOURCE_NAME, ingestWorldBank } from "../lib/ingestion/ingest-worldbank";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const OUTCOME_LABEL = { write: "写入", duplicate: "已有（本国平台）", review: "待审", excluded: "规则排除", closed: "已截止" } as const;
/** The daily window, by publication. A call stays open for weeks, so the first run reads 120 days. */
const DAILY_DAYS = 7;
const BACKFILL_DAYS = 120;

function daysFromArgv(): number | undefined {
  const at = process.argv.indexOf("--days");
  if (at < 0) return undefined;
  const days = Number(process.argv[at + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days 需要 1–365 之间的整数");
  return days;
}

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  let days = daysFromArgv() ?? DAILY_DAYS;
  if (supabase && daysFromArgv() === undefined) {
    const { count, error } = await supabase.from("tenders").select("id", { count: "exact", head: true }).eq("source_name", WORLDBANK_SOURCE_NAME);
    if (error) throw new Error(`读取已入库的世界银行项目失败：${error.message}`);
    if ((count ?? 0) === 0) {
      days = BACKFILL_DAYS;
      console.log(`库里还没有世界银行项目：这次回补近 ${BACKFILL_DAYS} 天。`);
    }
  }

  const result = await ingestWorldBank(supabase, { write, days, log: (line) => console.log(line) });
  const all = result.countries.flatMap((country) => country.rows);
  const count = (outcome: keyof typeof OUTCOME_LABEL) => all.filter((row) => row.outcome === outcome).length;
  console.log(`\n世界银行近 ${days} 天招标 ${all.length} 条：写入 ${count("write")}，本国平台已有 ${count("duplicate")}，待审 ${count("review")}，规则排除 ${count("excluded")}，已截止 ${count("closed")}`);
  for (const row of all.filter((entry) => entry.outcome !== "closed" && entry.outcome !== "excluded")) {
    const { tender, match } = row;
    console.log(`  [${OUTCOME_LABEL[row.outcome]}·${TIER_LABEL[tender.relevance.tier]}] ${tender.country} | ${tender.tenderNumber} | 截止 ${tender.submissionDeadline?.slice(0, 10) ?? "—"} | ${tender.title.es.slice(0, 80)}`);
    if (match) console.log(`      对上：${match.candidate.slug}（${match.candidate.sourceName ?? "—"}，${match.kind}）`);
  }
  const truncated = result.countries.filter((country) => country.truncated).map((country) => country.country);
  if (truncated.length > 0) console.log(`\n翻页到上限、可能不全：${truncated.join("、")}`);

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }
  const failed = result.failed ?? [];
  const noticesRead = result.countries.reduce((sum, country) => sum + country.notices, 0);
  const problem = noticesRead === 0 ? "世界银行接口一条都没返回（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-worldbank",
    problem ? "failed" : "ok",
    problem ?? `招标 ${all.length} 条，写入 ${result.upsertedCount ?? 0} 条，本国平台已有 ${count("duplicate")} 条，待审 ${count("review")} 条`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
