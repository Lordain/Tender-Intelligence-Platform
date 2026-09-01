/**
 * Ingests a locally-saved export of Colombia's real SECOP II Socrata
 * dataset (see lib/ingestion/colombia-mapper.ts for the confirmed real,
 * unauthenticated endpoint and README.md for how to pull a page of it).
 *
 * Usage:
 *   npm run ingest:colombia -- --fixture
 *   npm run ingest:colombia -- path/to/rows.json [--write]
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readColombiaSecopFile } from "../lib/ingestion/connectors/colombia-secop-file";
import { mapSecopRowToTender } from "../lib/ingestion/colombia-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";

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
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:colombia -- <rows.json> [--write]");
    console.error("   or: npm run ingest:colombia -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-colombia-secop.json")
    : filePath!;

  const rows = readColombiaSecopFile(resolvedPath);
  const tenders = rows
    .map((row) => mapSecopRowToTender(row, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} of ${rows.length} rows.`);

  if (!shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
