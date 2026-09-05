/**
 * Ingests a locally-downloaded CompraNet 5.0 historical bulk export (CSV or
 * XLSX from comprasmx.buengobierno.gob.mx/datos-abiertos) into Supabase.
 *
 * Usage:
 *   npm run ingest:compranet5 -- --fixture                      (offline dry run against the sample fixture, prints mapped output, doesn't write)
 *   npm run ingest:compranet5 -- path/to/downloaded-file.xlsx    (dry run against a real downloaded file — prints output, doesn't write)
 *   npm run ingest:compranet5 -- path/to/downloaded-file.xlsx --write   (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readCompranet5BulkFile } from "../lib/ingestion/connectors/compranet5-bulk-file";
import { mapCompranet5RowToTender } from "../lib/ingestion/compranet5-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Histórico de CompraNet 5.0 — Compras MX (Datos Abiertos)";
const SOURCE_URL_BASE = "https://historico-compranet.buengobierno.gob.mx/expediente/";

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
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:compranet5 -- <file.csv|file.xlsx> [--write]");
    console.error("   or: npm run ingest:compranet5 -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-compranet5-row.csv")
    : filePath!;

  const rows = await readCompranet5BulkFile(resolvedPath);
  const mappedTenders = rows
    .map((row) => mapCompranet5RowToTender(row, SOURCE_NAME, SOURCE_URL_BASE))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${mappedTenders.length} of ${rows.length} rows.`);

  // Every row parsed but none mapped is almost always a header/schema
  // mismatch this mapper hasn't seen — the exact wrong-schema bug this
  // caught once already (see README.md). Printing the raw shape of one
  // real row here beats a silent "Mapped 0" and a guessing match over
  // chat, where accents/whitespace can get mangled in transit.
  if (!useFixture && rows.length > 0 && mappedTenders.length === 0) {
    const sample = rows[0] as Record<string, unknown>;
    console.error("\nNo rows mapped — dumping the first real row for diagnosis:");
    console.error("Column names found in this file:", Object.keys(sample));
    console.error("Required-field values this mapper reads from that row:");
    for (const key of ["Número del procedimiento", "Código del expediente", "Título del expediente", "Institución", "Fecha de publicación"]) {
      console.error(`  ${JSON.stringify(key)}: ${JSON.stringify(sample[key])}`);
    }
  }

  const tenders = filterRecentTenders(mappedTenders, months);
  if (tenders.length !== mappedTenders.length) {
    console.log(
      `Keeping ${tenders.length} of ${mappedTenders.length} published within the last ${months} month(s) (pass --months 0 to disable).`,
    );
  }

  if (!shouldWrite) {
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
