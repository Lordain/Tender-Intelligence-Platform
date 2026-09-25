/**
 * CLI for Chile — a thin wrapper around lib/ingestion/ingest-chile.ts, which
 * is where the logic lives so the admin button (not added yet, see README)
 * cannot grow a second copy of it.
 *
 * TWO DOORS, and `--door` picks between them:
 *
 *   --door ocds   (default) ChileCompra's OCDS export. Structured, CC0,
 *                 carries a region field — and has published nothing since
 *                 2026-07-29, so a default run keeps zero rows and says why.
 *   --door busca  Mercado Público's public search. No credential, serves
 *                 tenders published TODAY, but it is a UI rather than a
 *                 published data API and carries no stability promise.
 *
 * The default stays `ocds` so nothing that already calls this changes
 * behaviour. See lib/ingestion/connectors/chile-*-live.ts for what each door
 * is and, in both, the responses whose HTTP status is not what they mean.
 *
 * DRY RUN BY DEFAULT. `--write` has to come after `--` or npm eats it; see
 * lib/cli-write-flag.ts for the day that cost a real reclassify.
 *
 * Usage:
 *   npm run ingest:chile-live                                 (OCDS, last 2 months, dry run)
 *   npm run ingest:chile-live -- --month 2026-07              (one specific month)
 *   npm run ingest:chile-live -- --month 2026-07 --max 200    (a cheap look at a ~9,000-record month)
 *   npm run ingest:chile-live -- --door busca                 (the live search — ~15 requests, all 4,000ish open tenders)
 *   npm run ingest:chile-live -- --door busca --max 200       (one export page instead of the whole corpus)
 *   npm run ingest:chile-live -- --door busca --enrich 100    (also fetch closing dates for 100 rows, 10 per request)
 *   npm run ingest:chile-live -- --days 30
 *   npm run ingest:chile-live -- --json                       (raw Tender objects instead of the report)
 *   npm run ingest:chile-live -- --month 2026-07 --write
 */
import { ingestChile } from "../lib/ingestion/ingest-chile";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { USD_RATES } from "@/lib/currency";
import { AVAILABLE_COUNTRIES } from "@/lib/tender-list-page";

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

  const door = argValue(args, "--door") ?? "ocds";
  if (door !== "ocds" && door !== "busca") {
    console.error(`--door 只能是 ocds 或 busca，收到的是「${door}」`);
    process.exit(1);
  }

  const result = await ingestChile(
    supabase,
    {
      write,
      door,
      months: Number(argValue(args, "--months") ?? 2),
      month: argValue(args, "--month"),
      days: Number(argValue(args, "--days") ?? 0),
      maxRecords: Number(argValue(args, "--max") ?? 0),
      enrichLimit: Number(argValue(args, "--enrich") ?? 0),
      preview: !write,
    },
    (message) => console.log(`  ${message}`),
  );

  // Printed BEFORE the counts, not after. A reader who sees "Mapped 0" first
  // reaches for the window flags; the warning is what stops them.
  if (result.freshnessWarning) console.log(`\n${result.freshnessWarning}\n`);
  if (result.staleWarning) console.log(`\n${result.staleWarning}\n`);

  console.log(`门：${result.door === "busca" ? "公开搜索（www.mercadopublico.cl/BuscarLicitacion）" : "OCDS 导出（api(s).mercadopublico.cl）"}`);
  if (result.months.length > 0) console.log(`月份：${result.months.join("、")}`);
  console.log(`Mapped ${result.mappedCount} tender(s) from ${result.fetchedCount} record(s).`);
  if (result.keptAfterRecencyCount !== result.mappedCount) {
    console.log(`Keeping ${result.keptAfterRecencyCount} of ${result.mappedCount} within the recency window.`);
  }
  if (result.door === "busca") {
    // Every one of these is a gap or a surprise rather than a statistic, and
    // each is printed even when it is zero-shaped, because "we looked and
    // found none" and "we never looked" are the distinction this whole source
    // has been built around.
    console.log(
      `交标截止日：${result.enrichedCount} / ${result.keptAfterRecencyCount} 条有` +
        `（CSV 里没有这一列，只能从 HTML 每页 10 条补；--enrich 控制补多少）`,
    );
    console.log(`金额是 UTM 档位而不是数字的：${result.bandedAmountCount} 条（对方没公布金额，不是我们没读到）`);
    if (result.malformedRows.length > 0) {
      console.log(`\n⚠ ${result.malformedRows.length} 行 CSV 字段数不是 11，已跳过（没有猜着对齐）：`);
      for (const bad of result.malformedRows.slice(0, 5)) console.log(`  第 ${bad.line} 行，${bad.fields} 个字段：${bad.text.slice(0, 120)}`);
    }
    if (result.unmappedEstados.length > 0) {
      console.log(`\n⚠ 出现了映射表里没有的 Estado 文案，这些行被丢掉而不是当成「招标中」：`);
      for (const estado of result.unmappedEstados) console.log(`  「${estado}」`);
      console.log("  要加的话改 lib/ingestion/chile-busca-mapper.ts 里的 CHILE_BUSCA_ESTADO_TEXTS。");
    }
  }

  if (result.failedRecords.length > 0) {
    // Reported, never swallowed: a month that lost 800 of 9,000 records to
    // per-record failures looks identical to a month that had 8,200 in it.
    console.log(`\n${result.failedRecords.length} 条记录单独抓取失败（不影响其余记录）：`);
    for (const f of result.failedRecords.slice(0, 10)) console.log(`  ${f.code}: ${f.error.split("\n")[0]}`);
  }

  if (!write) {
    if (args.includes("--json")) {
      console.log(JSON.stringify(result.sample, null, 2));
    } else {
      reportClassificationPreview(result.preview ?? [], {
        examples: Number(argValue(args, "--examples") ?? 25),
        label: "ingest-chile-live",
        exportBaseName: "chile-preview",
      });
    }
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    // Said here too, because a dry run is where someone decides whether Chile
    // is ready to turn on. Both halves are CHECKED rather than asserted: the
    // CLP half was a hardcoded string that went on warning for days after the
    // rate was added, which is the failure mode this repo keeps meeting —
    // a sentence that once described a measurement and now just repeats.
    const blockers: string[] = [];
    if (!AVAILABLE_COUNTRIES.includes("Chile" as (typeof AVAILABLE_COUNTRIES)[number])) {
      blockers.push("智利还不对外可见 —— lib/tender-list-page.ts 的 AVAILABLE_COUNTRIES 里没有它，导进来的行访客看不到");
    }
    if (!USD_RATES.CLP) {
      blockers.push("lib/currency.ts 里没有 CLP 汇率 —— 没有汇率，一条真实的比索金额会被分级器读成「没有公布金额」");
    }
    if (blockers.length > 0) console.log(`\n注意：\n${blockers.map((b) => `  · ${b}`).join("\n")}`);
    return;
  }

  if (result.failed && result.failed.length > 0) {
    console.error(`${result.failed.length} row(s) failed to upsert:`);
    for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${result.upsertedCount ?? 0} tender(s); skipped ${result.skippedExcludedCount ?? 0} excluded.`);
}

main();
