/**
 * The daily read of CFE's calls in the DOF, as a plain script so the GitHub
 * Actions schedule can run it. Invoked by .github/workflows/daily-ingest.yml.
 * Added 2026-10-06 (user: A, B都做) — until then the DOF was read only when an
 * admin pressed 「DOF 直接拉取」, so a CFE call reached the platform only on
 * the days someone remembered to.
 *
 * Same path as that button (lib/ingestion/import-dof-search-live.ts): both
 * CFE searches (the full name and the "CFE <unit>" names), each notice's
 * detail page, CFE's own relevance rules, and upsertTendersBatched() — so the
 * platform's filters apply exactly as they do to a manual run. A call already
 * pasted in from CFE's micrositio is left as pasted.
 *
 * The window is the last 10 days of DOF editions: the DOF prints a CFE call
 * 2–5 days after the micrositio, and a wider window than one day means a
 * night the DOF did not answer is picked up by the next run.
 *
 * Usage:
 *   npm run cron:cfe-dof                      (dry run — fetches and classifies, writes nothing)
 *   npm run cron:cfe-dof -- --write
 *   npm run cron:cfe-dof -- --days 30
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { importDofSearchLive } from "../lib/ingestion/import-dof-search-live";
import { DOF_CFE_TERMS } from "../lib/ingestion/dof-sources";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function daysFlag(): number {
  const at = process.argv.indexOf("--days");
  if (at < 0) return 10;
  const days = Number(process.argv[at + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("--days 需要 1–90 之间的整数");
  return days;
}

/** dd-mm-yyyy, the DOF search's own format, of the day in Mexico City (UTC-6). */
function dofDate(instant: Date): string {
  const local = new Date(instant.getTime() - 6 * 60 * 60 * 1000);
  return `${String(local.getUTCDate()).padStart(2, "0")}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${local.getUTCFullYear()}`;
}

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const now = new Date();
  const fechaIni = dofDate(new Date(now.getTime() - daysFlag() * 24 * 60 * 60 * 1000));
  const fechaFin = dofDate(now);
  const result = await importDofSearchLive({ textos: [...DOF_CFE_TERMS], cfeOnly: true, fechaIni, fechaFin }, { write });

  console.log(
    `\nDOF ${fechaIni} 至 ${fechaFin}：CFE 公告 ${result.totalNotas} 条，读到详情 ${result.detailsFetched} 条，映射 ${result.mappedCount} 条，` +
      `在窗口内 ${result.keptAfterRecencyCount} 条${result.skippedPastedCount ? `（另有 ${result.skippedPastedCount} 条已从 CFE 网站粘贴导入，保留粘贴版本）` : ""}`,
  );
  for (const tender of result.sample) {
    console.log(`  [${TIER_LABEL[tender.relevance.tier] ?? tender.relevance.tier}] ${tender.tenderNumber} | ${tender.title.es.slice(0, 90)}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。`);
    return;
  }

  const failed = result.failed ?? [];
  const problem = result.totalNotas === 0 ? "DOF 一条 CFE 公告都没返回（见日志）" : failed.length > 0 ? `${failed.length} 条写入失败` : null;
  await writeCronHeartbeat(
    supabase!,
    "import-cfe-dof",
    problem ? "failed" : "ok",
    problem ??
      `${fechaIni}～${fechaFin}：公告 ${result.totalNotas} 条，详情 ${result.detailsFetched} 条，写入 ${result.upsertedCount ?? 0} 条，排除 ${result.skippedExcludedCount ?? 0} 条`,
  );
  if (failed.length > 0) for (const f of failed.slice(0, 10)) console.error(`  ${f.slug} —— ${f.error}`);
  if (problem) process.exit(1);
  console.log(`\n写入 ${result.upsertedCount ?? 0} 条。完成。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
