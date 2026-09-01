/**
 * Ingests a locally-downloaded Compras MX "Datos Abiertos" contracts CSV
 * (comprasmx.buengobierno.gob.mx/datos-abiertos) into Supabase. This is the
 * confirmed-real, current-system export — see
 * lib/ingestion/compras-mx-contracts-mapper.ts for the verified column
 * schema and lib/ingestion/README.md for the contracts-vs-open-tenders
 * caveat (this data is awarded contracts, not tenders still open to bid).
 *
 * Usage:
 *   npm run ingest:comprasmx-contracts -- --fixture                    (offline dry run)
 *   npm run ingest:comprasmx-contracts -- path/to/file.csv              (dry run against a real downloaded file)
 *   npm run ingest:comprasmx-contracts -- path/to/file.csv --write      (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readComprasMxContractsFile } from "../lib/ingestion/connectors/compras-mx-contracts-bulk-file";
import { mapComprasMxContractRowToTender } from "../lib/ingestion/compras-mx-contracts-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Compras MX — Contratos (Datos Abiertos)";

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
    if (failed.length > 20) console.error(`  ...and ${failed.length - 20} more.`);
  }

  console.log(`Upserted ${upsertedCount} of ${tenders.length} mapped tenders.`);
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:comprasmx-contracts -- <file.csv> [--write]");
    console.error("   or: npm run ingest:comprasmx-contracts -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-compras-mx-contracts.csv")
    : filePath!;

  const rows = readComprasMxContractsFile(resolvedPath);
  const tenders = rows
    .map((row) => mapComprasMxContractRowToTender(row, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} of ${rows.length} rows.`);

  if (!shouldWrite) {
    // A real bulk file can map tens of thousands of tenders — printing all
    // of them to stdout on a dry run isn't useful past confirming the shape
    // looks right, so only the fixture (a couple of rows) prints in full.
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    if (!useFixture && tenders.length > 5) {
      console.log(`\n...and ${tenders.length - 5} more (showing first 5 of a real file's dry run).`);
    }
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
    return;
  }

  await upsertTenders(tenders);
}

main();
