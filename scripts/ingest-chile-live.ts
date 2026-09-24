/**
 * CLI for Chile's ChileCompra / Mercado Público OCDS export — a thin wrapper
 * around lib/ingestion/ingest-chile.ts, which is where the logic lives so the
 * admin button (not added yet, see README) cannot grow a second copy of it.
 *
 * See lib/ingestion/connectors/chile-ocds-live.ts for what this door is, the
 * three responses whose HTTP status is not what they mean, and why a run that
 * keeps zero rows today is a fact about the SOURCE rather than about the
 * window you asked for.
 *
 * DRY RUN BY DEFAULT. `--write` has to come after `--` or npm eats it; see
 * lib/cli-write-flag.ts for the day that cost a real reclassify.
 *
 * Usage:
 *   npm run ingest:chile-live                                (last 2 months, dry run)
 *   npm run ingest:chile-live -- --month 2026-07             (one specific month)
 *   npm run ingest:chile-live -- --month 2026-07 --max 200   (a cheap look at a ~9,000-record month)
 *   npm run ingest:chile-live -- --days 30
 *   npm run ingest:chile-live -- --json                      (raw Tender objects instead of the report)
 *   npm run ingest:chile-live -- --month 2026-07 --write
 */
import { ingestChile } from "../lib/ingestion/ingest-chile";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";

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

  const result = await ingestChile(
    supabase,
    {
      write,
      months: Number(argValue(args, "--months") ?? 2),
      month: argValue(args, "--month"),
      days: Number(argValue(args, "--days") ?? 0),
      maxRecords: Number(argValue(args, "--max") ?? 0),
      preview: !write,
    },
    (message) => console.log(`  ${message}`),
  );

  // Printed BEFORE the counts, not after. A reader who sees "Mapped 0" first
  // reaches for the window flags; the warning is what stops them.
  if (result.freshnessWarning) console.log(`\n${result.freshnessWarning}\n`);

  console.log(`月份：${result.months.join("、")}`);
  console.log(`Mapped ${result.mappedCount} tender(s) from ${result.fetchedCount} record(s).`);
  if (result.keptAfterRecencyCount !== result.mappedCount) {
    console.log(`Keeping ${result.keptAfterRecencyCount} of ${result.mappedCount} within the recency window.`);
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
    // is ready to turn on — and it is not, for a reason that has nothing to do
    // with this code.
    console.log(
      "注意：智利目前还不对外可见（lib/tender-list-page.ts 的 AVAILABLE_COUNTRIES 里没有它），" +
        "而且 lib/currency.ts 里没有 CLP 汇率 —— 没有汇率，一条真实的比索金额会被分级器读成「没有公布金额」。",
    );
    return;
  }

  if (result.failed && result.failed.length > 0) {
    console.error(`${result.failed.length} row(s) failed to upsert:`);
    for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${result.upsertedCount ?? 0} tender(s); skipped ${result.skippedExcludedCount ?? 0} excluded.`);
}

main();
