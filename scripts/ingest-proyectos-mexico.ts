/**
 * Ingests a locally-downloaded proyectosmexico.gob.mx/proyectos/ CSV
 * export (Banobras/SHCP's official curated list of strategic national
 * investment projects — see lib/ingestion/proyectos-mexico-mapper.ts).
 * Every ingested tender is tagged `isNationalPriorityProject: true`,
 * which promotes it straight to flagship tier regardless of value/
 * keyword matches — per the user's explicit request (2026-09-02): being
 * listed on this official government source IS the signal.
 *
 * Usage:
 *   npm run ingest:proyectos-mexico -- --fixture                    (offline dry run)
 *   npm run ingest:proyectos-mexico -- path/to/file.csv              (dry run against a real downloaded file)
 *   npm run ingest:proyectos-mexico -- path/to/file.csv --write      (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readProyectosMexicoFile } from "../lib/ingestion/connectors/proyectos-mexico-file";
import { mapProyectosMexicoRowToTender } from "../lib/ingestion/proyectos-mexico-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Proyectos México (Banobras/SHCP)";

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
    console.error("Usage: npm run ingest:proyectos-mexico -- <file.csv> [--write]");
    console.error("   or: npm run ingest:proyectos-mexico -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-proyectos-mexico.csv")
    : filePath!;

  const rows = readProyectosMexicoFile(resolvedPath);
  const mappedTenders = rows
    .map((row) => mapProyectosMexicoRowToTender(row, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  // No --months recency filter here, unlike every other ingest script:
  // this source only ever lists currently-in-bidding projects (Etapa ===
  // "Licitación", already filtered inside the mapper) — there's no
  // multi-year historical backlog to trim the way a Datos Abiertos bulk
  // export has.
  console.log(`Mapped ${mappedTenders.length} of ${rows.length} rows (rows not in "Licitación" stage are skipped by the mapper).`);

  if (!shouldWrite) {
    console.log(JSON.stringify(mappedTenders, null, 2));
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
    return;
  }

  await upsertTenders(mappedTenders);
}

main();
