/**
 * The daily read of Suriname's gov.sr 「Aanbestedingen」, as a plain script so
 * the GitHub Actions schedule can run it (.github/workflows/daily-ingest.yml).
 * Added 2026-10-16 (user: 苏里南做，先只在后台可见 → A). Suriname is STAGED
 * (lib/staged-countries.ts): what this writes shows in the admin pages only.
 * One request per run — robots.txt asks for 60 seconds between requests.
 *
 * Usage:
 *   npm run cron:suriname              (dry run — reads and classifies, writes nothing)
 *   npm run cron:suriname -- --write
 *   npm run cron:suriname -- --fixture lib/ingestion/__fixtures__/suriname/aanbestedingen-2026-10-16.json
 */
import { readFileSync } from "node:fs";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestSuriname, type SurinameRow } from "../lib/ingestion/ingest-suriname";
import type { SurinamePost } from "../lib/ingestion/connectors/suriname-govsr-live";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const METHOD_LABEL: Record<string, string> = { icb: "国际招标", ncb: "国内招标", eoi: "咨询意向征询" };
const OUTCOME_HEADING: Record<SurinameRow["outcome"], string> = {
  write: "保留、仍在招标（写入）",
  no_deadline: "规则保留但读不出截止日（不写入，请打开原文看）",
  closed: "规则保留但已截止",
  excluded: "排除",
};

function paramaribo(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Paramaribo" }).slice(0, 16);
}

async function main() {
  const fixtureIndex = process.argv.indexOf("--fixture");
  const posts: SurinamePost[] | undefined = fixtureIndex >= 0 ? JSON.parse(readFileSync(process.argv[fixtureIndex + 1], "utf8")) : undefined;
  const write = hasWriteFlag() && !posts;
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestSuriname(supabase, { write, posts });
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);
  console.log(`gov.sr 招标栏目 ${result.postCount} 条；保留且仍在招标 ${result.kept.length} 条。\n`);
  for (const outcome of ["write", "no_deadline", "closed", "excluded"] as const) {
    const group = result.rows.filter((row) => row.outcome === outcome);
    if (group.length === 0) continue;
    console.log(`== ${OUTCOME_HEADING[outcome]}（${group.length}）==`);
    for (const { notice, tender } of group) {
      console.log(
        `  [${TIER_LABEL[tender.relevance.tier] ?? tender.relevance.tier}] 截止 ${paramaribo(notice.deadline)} · ${notice.method ? METHOD_LABEL[notice.method] : "未写明方式"} · ${notice.financier ?? "出资方未写明"} | ${notice.title.slice(0, 90)}`,
      );
      if (outcome !== "excluded") console.log(`         ${notice.url}`);
    }
    console.log("");
  }

  if (!write) {
    console.log("试运行（加 --write 才真的写入）——什么都没动。");
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.staleWarning ? "源头没返回文章（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-suriname",
    problem ? "failed" : "ok",
    problem ?? `招标栏目 ${result.postCount} 条，保留在招 ${result.kept.length} 条，写入 ${result.upsertedCount ?? 0} 条（未公开）`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
