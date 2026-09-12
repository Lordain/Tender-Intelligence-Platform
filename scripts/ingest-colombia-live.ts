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
 *   npm run ingest:colombia-live -- [--months 6] [--max-pages 20]
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
  const months = argNumber(args, "--months", 6);
  const maxPages = argNumber(args, "--max-pages", 20);

  const supabase = shouldWrite ? createSupabaseAdminClient() : null;
  if (shouldWrite && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  console.log(`Fetching real SECOP II rows published within the last ${months} month(s) (up to ${maxPages * 1000} rows)...`);
  const result = await ingestColombia(supabase!, { months, maxPages, write: shouldWrite, fetchDocuments });

  console.log(`Fetched ${result.fetchedCount} real row(s), mapped ${result.mappedCount}, kept ${result.keptAfterRecencyCount} within the last ${months} month(s).`);

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
