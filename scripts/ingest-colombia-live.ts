/**
 * CLI wrapper around lib/ingestion/ingest-colombia.ts — see that file for
 * the real logic (fetching + mapping + upserting the tender list, and
 * optionally the pre-award document bulk-download). Same underlying
 * function backs the admin "SECOP II — 哥伦比亚标书 + 附件" panel
 * (app/admin/import-tenders/), added 2026-09-04 per the user's explicit
 * request to also pull documents in the same run, not just the tender
 * list ingest-colombia-live.ts originally only did.
 *
 * Usage:
 *   npm run ingest:colombia-live -- [--months 1] [--max-pages 20]
 *   npm run ingest:colombia-live -- --days 5            (滚动天数窗口，--months 失效)
 *   npm run ingest:colombia-live -- --write [--fetch-documents]
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ingestColombia } from "../lib/ingestion/ingest-colombia";

function argNumber(args: string[], flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  return idx >= 0 ? Number(args[idx + 1]) : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const fetchDocuments = args.includes("--fetch-documents");
  // One month, not six. The six-month default was the widest window in the
  // codebase and the only one a caller got by saying nothing — the admin
  // forms all default to 1 and the scheduled runs now do too, so a plain
  // CLI run silently pulled six times as far back as the same import
  // through any other door (2026-09-13: months-old PEMEX rows in the admin
  // list). Pass --months explicitly for a deliberate backfill.
  const months = argNumber(args, "--months", 1);
  // Wins over --months when set, rather than being reconciled with it — see
  // IngestColombiaOptions.days. Asking for 5 days and 1 month used to be
  // expressible and meant neither.
  const days = argNumber(args, "--days", 0);
  const maxPages = argNumber(args, "--max-pages", 20);
  const windowLabel = days > 0 ? `${days} day(s)` : `${months} month(s)`;

  const supabase = shouldWrite ? createSupabaseAdminClient() : null;
  if (shouldWrite && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  console.log(`Fetching real SECOP II rows published within the last ${windowLabel} (up to ${maxPages * 1000} rows)...`);
  const result = await ingestColombia(supabase!, { months, days, maxPages, write: shouldWrite, fetchDocuments });

  console.log(`Fetched ${result.fetchedCount} real row(s), mapped ${result.mappedCount}, kept ${result.keptAfterRecencyCount} within the last ${windowLabel}.`);

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  console.log(`Upserted ${result.upsertedCount} of ${result.keptAfterRecencyCount} mapped tenders.`);
  if (result.skippedExcludedCount) console.log(`Skipped ${result.skippedExcludedCount} classified "excluded".`);
  if (result.failed && result.failed.length > 0) {
    console.error(`${result.failed.length} row(s) failed to upsert:`);
    for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }

  if (fetchDocuments) {
    console.log(
      `Documents: checked ${result.documentsCandidateTenders ?? 0} newly-written tender(s), downloaded ${result.documentsDownloaded ?? 0}` +
        (result.documentsAlreadyOnFile ? `, ${result.documentsAlreadyOnFile} already on file` : "") +
        (result.documentsFailed ? `, ${result.documentsFailed} failed` : "") +
        ".",
    );
  }
}

main();
