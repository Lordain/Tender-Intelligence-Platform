/**
 * Ingests a locally-exported "Difusión de procedimientos" file — the
 * public search page's own browser Excel export listing procedures still
 * in progress (no award yet), as opposed to the Datos Abiertos contracts
 * export (awarded/historical). See
 * lib/ingestion/compras-mx-open-tenders-mapper.ts and lib/ingestion/README.md
 * for why this file, not the page's anti-automation-gated JSON API, is the
 * source used here.
 *
 * Usage:
 *   npm run ingest:comprasmx-open -- --fixture                    (offline dry run)
 *   npm run ingest:comprasmx-open -- path/to/export.xlsx           (dry run against a real exported file)
 *   npm run ingest:comprasmx-open -- path/to/export.xlsx --write   (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readComprasMxOpenTendersFile } from "../lib/ingestion/connectors/compras-mx-open-tenders-file";
import { mapComprasMxOpenTenderRowToTender } from "../lib/ingestion/compras-mx-open-tenders-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Compras MX — Difusión de procedimientos (exportación pública)";
const SOURCE_URL = "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/";

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
    console.error("Usage: npm run ingest:comprasmx-open -- <file.xlsx|file.csv> [--write]");
    console.error("   or: npm run ingest:comprasmx-open -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-comprasmx-open-tenders.xlsx")
    : filePath!;

  const rows = await readComprasMxOpenTendersFile(resolvedPath);
  const tenders = rows
    .map((row) => mapComprasMxOpenTenderRowToTender(row, SOURCE_NAME, SOURCE_URL))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} of ${rows.length} rows.`);

  if (useFixture || !shouldWrite) {
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
