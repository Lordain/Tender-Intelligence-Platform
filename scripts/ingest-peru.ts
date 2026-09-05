/**
 * Ingests an already-extracted real OECE (Peru) record package JSON file
 * — see lib/ingestion/peru-oece-mapper.ts for the confirmed real,
 * unauthenticated source and lib/ingestion/README.md for how to
 * download and unzip one. `ingest-peru-live.ts` does the fetch+unzip
 * automatically; this stays as a manual/offline fallback.
 *
 * Usage:
 *   npm run ingest:peru -- --fixture
 *   npm run ingest:peru -- path/to/2026-08_seace_v3_json.json [--write]
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readPeruOeceFile } from "../lib/ingestion/connectors/peru-oece-file";
import { mapOeceRecordToTender } from "../lib/ingestion/peru-oece-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "OECE — Organismo Especializado para las Contrataciones Públicas Eficientes (Perú)";

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
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:peru -- <record-package.json> [--write]");
    console.error("   or: npm run ingest:peru -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-peru-oece.json")
    : filePath!;

  const { records } = readPeruOeceFile(resolvedPath);
  const mappedTenders = records
    .map((record) => mapOeceRecordToTender(record, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${mappedTenders.length} of ${records.length} records.`);

  const tenders = filterRecentTenders(mappedTenders, months);
  if (tenders.length !== mappedTenders.length) {
    console.log(
      `Keeping ${tenders.length} of ${mappedTenders.length} published within the last ${months} month(s) (pass --months 0 to disable).`,
    );
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
