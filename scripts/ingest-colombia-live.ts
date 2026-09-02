/**
 * Automated ingest for Colombia's SECOP II tender list — fetches real rows
 * directly from the live Socrata endpoint (see
 * lib/ingestion/connectors/colombia-secop-live.ts) instead of requiring a
 * human to capture a JSON export first, the way ingest-colombia.ts still
 * does (kept as-is for a manual/offline fallback). This is the automated
 * counterpart to what ingest-colombia-documents.ts already does for SECOP
 * II's document downloads — together they make Colombia's SECOP II source
 * the second fully automatable one in this project (Ecopetrol's two public
 * sources are automatable in the sense of "no anti-bot gate," but still
 * require a human to save the exported file first).
 *
 * Usage:
 *   npm run ingest:colombia-live -- [--months 6] [--max-pages 20]
 *   npm run ingest:colombia-live -- --write
 */
import { fetchSecopProcesos } from "../lib/ingestion/connectors/colombia-secop-live";
import { mapSecopRowToTender } from "../lib/ingestion/colombia-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";

function argNumber(args: string[], flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  return idx >= 0 ? Number(args[idx + 1]) : fallback;
}

async function upsertTenders(tenders: Tender[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, tenders, (done, total) => {
    console.log(`Upserted ${done}/${total}...`);
  });
  if (failed.length > 0) {
    console.error(`${failed.length} row(s) failed to upsert:`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${upsertedCount} of ${tenders.length} mapped tenders.`);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const months = argNumber(args, "--months", 6);
  const maxPages = argNumber(args, "--max-pages", 20);

  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - (months > 0 ? months : 6));

  console.log(`Fetching real SECOP II rows published on/after ${sinceDate.toISOString().slice(0, 10)} (up to ${maxPages * 1000} rows)...`);
  const rows = await fetchSecopProcesos({ sinceDate, maxPages });
  console.log(`Fetched ${rows.length} real row(s).`);

  const mappedTenders = rows
    .map((row) => mapSecopRowToTender(row, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);
  console.log(`Mapped ${mappedTenders.length} of ${rows.length} rows.`);

  // $where already filters server-side, but this stays as a second, exact
  // check against the same real publicationDate every other source uses —
  // cheap, and it protects against the sinceDate math here ever drifting
  // from filterRecentTenders()'s own cutoff logic.
  const tenders = filterRecentTenders(mappedTenders, months);
  if (tenders.length !== mappedTenders.length) {
    console.log(`Keeping ${tenders.length} of ${mappedTenders.length} published within the last ${months} month(s).`);
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
