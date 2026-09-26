/**
 * The daily status refresh for tenders already stored, as a plain script so
 * the GitHub Actions schedule can run it. Invoked by
 * .github/workflows/daily-ingest.yml. Added 2026-09-26 (user: 自动&手动，刷新
 * 标书状态 / 不只秘鲁，所有国家都应考虑 / 也要考虑后续的恢复或者取消、重发).
 *
 * Most imports keep only tenders published in the last few days, so a tender
 * imported last week is never read again by them — and a pause, resumption,
 * cancellation, 流标 or award that happens to it afterwards never arrived.
 * This asks each source about the tenders it already gave us:
 *
 *   巴西 PNCP        one consulta request per stored tender (situação)
 *   智利 Mercado Público  one ficha per stored tender (Estado)
 *   墨西哥 Compras MX  LicitIA's full corpus (estatus, every section)
 *
 * The others are covered elsewhere: Colombia by cron:colombia's own refresh
 * pass, Peru OxI by cron:peru-oxi, Peru OECE by cron:peru-oece-status. The
 * company portals (Petronect, Codelco, Cemig, UPME, Petroperú, PEMEX) list
 * only what is open and say nothing about a tender once it leaves the list;
 * their tenders close on their deadline (lib/tender-status.ts).
 *
 * Only the status column moves; see lib/ingestion/status-refresh.ts for what
 * it refuses to change. Each source runs even if another fails.
 *
 * Usage:
 *   npm run cron:refresh-statuses              (dry run — compares, writes nothing)
 *   npm run cron:refresh-statuses -- --write
 *   npm run cron:refresh-statuses -- --only brazil,chile,mexico
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { refreshBrazilPncpStatuses } from "../lib/ingestion/ingest-brazil";
import { refreshChileStatuses } from "../lib/ingestion/ingest-chile";
import { refreshComprasMxStatuses } from "../lib/ingestion/refresh-comprasmx-statuses";
import { describeStatusRefresh, type StatusRefreshResult } from "../lib/ingestion/status-refresh";
import { writeCronHeartbeat } from "../lib/ops/cron-jobs";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { STATUS_LABELS } from "@/lib/tender-labels";
import type { TenderStatus } from "@/types/tender";

const LABELS = Object.fromEntries(Object.entries(STATUS_LABELS).map(([status, label]) => [status, label.zh])) as Record<TenderStatus, string>;

const SOURCES: { id: string; label: string; run: (write: boolean) => Promise<StatusRefreshResult & { notes?: string[] }> }[] = [
  {
    id: "brazil",
    label: "巴西 PNCP",
    run: async (write) => {
      const supabase = createSupabaseAdminClient()!;
      const r = await refreshBrazilPncpStatuses(supabase, { write }, (m) => console.log(`  ${m}`));
      return { ...r, notes: r.unreachable.length ? [`${r.unreachable.length} 条查询失败，例如 ${r.unreachable.slice(0, 2).join("；")}`] : [] };
    },
  },
  {
    id: "chile",
    label: "智利 Mercado Público",
    run: async (write) => {
      const supabase = createSupabaseAdminClient()!;
      const r = await refreshChileStatuses(supabase, { write }, (m) => console.log(`  ${m}`));
      const notes = [];
      if (r.unreachable.length) notes.push(`${r.unreachable.length} 条查询失败，例如 ${r.unreachable.slice(0, 2).join("；")}`);
      if (r.unknownEstados.length) notes.push(`不认识的 ficha 状态：${r.unknownEstados.join("、")}（未改动，需补进映射表）`);
      return { ...r, notes };
    },
  },
  {
    id: "mexico",
    label: "墨西哥 Compras MX",
    run: async (write) => {
      const supabase = createSupabaseAdminClient()!;
      const r = await refreshComprasMxStatuses(supabase, { write }, (m) => console.log(`  ${m}`));
      const notes = [];
      if (r.notInCorpus) notes.push(`${r.notInCorpus} 条在 LicitIA 全量数据里找不到（未改动）`);
      if (r.unknownEstatus.length) notes.push(`不认识的状态：${r.unknownEstatus.join("、")}（未改动，需补进映射表）`);
      return { ...r, notes };
    },
  },
];

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? new Set((process.argv[onlyIndex + 1] ?? "").split(",").map((s) => s.trim())) : null;

  const problems: string[] = [];
  const summary: string[] = [];
  for (const source of SOURCES.filter((s) => !only || only.has(s.id))) {
    console.log(`\n=== ${source.label} ===`);
    try {
      const result = await source.run(write);
      for (const line of describeStatusRefresh(result, LABELS)) console.log(line);
      for (const note of result.notes ?? []) console.log(`  ${note}`);
      if (result.failed) problems.push(`${source.label}：${result.failed}`);
      summary.push(`${source.label} 变化 ${result.changes.length} 条`);
    } catch (error) {
      problems.push(`${source.label}：${error instanceof Error ? error.message : String(error)}`);
      console.error(error);
    }
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的写入）——什么都没动。${problems.length ? `\n问题：${problems.join("；")}` : ""}`);
    if (problems.length) process.exit(1);
    return;
  }
  const problem = problems.join("；") || null;
  await writeCronHeartbeat(supabase, "refresh-statuses", problem ? "failed" : "ok", problem ?? summary.join("，"));
  if (problem) {
    console.error(`\n${problem}`);
    process.exit(1);
  }
  console.log("\n完成。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
