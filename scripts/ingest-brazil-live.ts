/**
 * CLI for Brazil's PNCP — a thin wrapper around lib/ingestion/ingest-brazil.ts.
 *
 * Read lib/ingestion/connectors/brazil-pncp-live.ts before changing any query
 * parameter here. The shape is not a preference; it is the only one that
 * survived four measurement runs, and three of its rules are the opposite of
 * what the documentation suggests (one modality per request, exactly one of
 * q/status, and a connection reset means retry rather than "rejected").
 *
 * DRY RUN BY DEFAULT, like every other ingest script, and it matters more
 * here than usual: this is a source that has never written a row. The first
 * run should be read, not trusted. `--write` needs the two dashes —
 * `npm run ingest:brazil-live --write` gives the flag to npm and quietly does
 * a dry run (lib/cli-write-flag.ts refuses rather than letting that pass).
 *
 * Usage:
 *   npm run ingest:brazil-live                              (dry run, Concorrência 4+5, last 2 months)
 *   npm run ingest:brazil-live -- --months 3
 *   npm run ingest:brazil-live -- --max 200                 (fewer pages per modality)
 *   npm run ingest:brazil-live -- --skip-amounts            (shape only — every row then reports no amount)
 *   npm run ingest:brazil-live -- --modalities 4            (just Concorrência Eletrônica)
 *   npm run ingest:brazil-live -- --write
 */
import { ingestBrazilPncp, BRAZIL_PNCP_SOURCE_NAME } from "../lib/ingestion/ingest-brazil";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const monthsRaw = argValue(args, "--months");
  const months = Number(monthsRaw ?? 2) || 2;
  const daysRaw = argValue(args, "--days");
  // Default 3 days, not 2 months. The window condition now pages until the
  // period is exhausted, so a 2-month default with the raised --max would
  // sweep for hours on a bare `npm run ingest:brazil-live` — and 3 days is
  // what this source is actually for (user, 2026-09-18: 我只想看最近3天的，
  // 我不想要导入大量项目处理). --months still overrides it for a backfill.
  const days = daysRaw !== undefined ? Number(daysRaw) : monthsRaw !== undefined ? undefined : 3;
  if (daysRaw !== undefined && (!Number.isFinite(days) || (days as number) < 1)) {
    console.error(`--days 认不出来："${daysRaw}"。给一个 1 以上的整数，例如 --days 3`);
    process.exit(1);
  }
  const maxRowsPerModality = Number(argValue(args, "--max") ?? 3000) || 3000;
  const raw = argValue(args, "--modalities");
  // One bare numeric id per value. A comma list is accepted HERE and expanded
  // into separate passes — what must never happen is passing a list to PNCP,
  // which keeps only the last value and silently returns a fraction of the
  // intended scope.
  const modalities = raw ? raw.split(",").map((part) => Number(part.trim())).filter((n) => Number.isInteger(n) && n > 0) : undefined;
  if (raw && (!modalities || modalities.length === 0)) {
    console.error(`--modalities 认不出来："${raw}"。给数字 id，多个用逗号分开，例如 --modalities 4,5`);
    process.exit(1);
  }

  console.log(`来源：${BRAZIL_PNCP_SOURCE_NAME}`);
  const windowLabel = days === undefined ? `${months} 个月` : `${days} 天`;
  console.log(`采购方式：${(modalities ?? [4, 5]).join("、")}　发布时间窗：${windowLabel}　每种最多取 ${maxRowsPerModality} 条\n`);

  const result = await ingestBrazilPncp(
    supabase,
    {
      write,
      months,
      ...(days === undefined ? {} : { days }),
      maxRowsPerModality,
      ...(modalities ? { modalities } : {}),
      skipAmounts: args.includes("--skip-amounts"),
    },
    (message) => console.log(`  ${message}`),
  );

  console.log("\n" + "─".repeat(72));
  // Whether the window was covered or merely sampled is the first thing to
  // read here. A run stopped by --max saw an unknown fraction of the period,
  // so every number under it is a floor — and the header line above says
  // "发布时间窗：2 个月", which without this would be a claim the run cannot
  // support.
  let cappedAny = false;
  for (const entry of result.byModality) {
    const how =
      entry.stoppedBy === "window"
        ? "已覆盖整个时间窗"
        : entry.stoppedBy === "end"
          ? "索引翻到底了"
          : "⚠ 被 --max 截断，时间窗没取完";
    if (entry.stoppedBy === "cap") cappedAny = true;
    console.log(`  采购方式 ${entry.modalidade}：${entry.rows} 条，翻了 ${entry.pages} 页 —— ${how}`);
  }
  if (cappedAny) {
    console.log(`\n  ⚠ 本次是抽样，不是全量：下面所有数字都是下限。要取完整个时间窗，把 --max 调大（或去掉）再跑。`);
  }
  console.log(`\n抓到 ${result.fetchedRows} 条，映射成 ${result.mappedCount} 条。`);
  console.log(`  进入推荐：${result.keptCount} 条　被规则排除：${result.excludedCount} 条`);

  // The composition of what was KEPT, for the same reason the exclusion
  // breakdown exists: a single total cannot tell "a few large projects" from
  // "a wall of contracts a hair over the floor", and those call for opposite
  // responses.
  if (result.keptByTier.length > 0) {
    const TIER_ZH: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规" };
    console.log(`\n  进入推荐的构成：`);
    for (const { tier, count } of result.keptByTier) {
      console.log(`    ${String(count).padStart(4)} 条  ${TIER_ZH[tier] ?? tier}`);
    }
    for (const { band, count } of result.keptByValueBand) {
      console.log(`    ${String(count).padStart(4)} 条  └ ${band}`);
    }
  }

  // Broken out rather than left as one number, because "excluded" covers two
  // completely different events and only one of them is good news. Under the
  // value threshold is the rule working as designed on a feed of small
  // municipal contracts. Dropped on a Portuguese keyword is an untested rule
  // deleting work, permanently — nothing excluded is ever written, so there
  // is no table to audit afterwards. The line below is the only place that
  // distinction is visible before a decision to write.
  if (result.excludedByReason.length > 0) {
    console.log(`\n  排除原因（多到少）：`);
    for (const { reason, count } of result.excludedByReason) {
      console.log(`    ${String(count).padStart(4)} 条  ${reason}`);
    }
  }
  if (result.excludedCsvPath) {
    console.log(`\n  被排除的 ${result.excludedCount} 条完整清单：${result.excludedCsvPath}`);
    console.log(`  写库前请扫一眼「关键词」那几类 —— 葡语规则还没被真实语料检验过，误杀是永久的。`);
  }
  // Reported prominently because a Brazilian tender without an amount cannot
  // be tiered on value at all — it falls through to the keyword path, and how
  // many do that is the single most useful number for judging whether this
  // source is worth writing.
  console.log(`  没有金额：${result.withoutAmount} 条${result.sealedBudget > 0 ? `（其中 ${result.sealedBudget} 条是法定预算保密，不是取不到）` : ""}`);

  if (!write) {
    console.log("\n试运行 —— 一条都没写进 Supabase。确认上面的分级和金额之后，用：");
    console.log("  npm run ingest:brazil-live -- --write");
    console.log("\n金额按 lib/currency.ts 里的 1 USD = 5.16 BRL 折成美元（2026-09-18 核对）。");
    console.log("巴西档位：常规 200–500 万、中型 500–1000 万、大型 1000 万以上（美元）。汇率变动超过 5% 时分级会跟着变。");
    return;
  }
  console.log(`\n已写入 ${result.written ?? 0} 条${result.failed ? `，失败 ${result.failed} 条` : ""}。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
