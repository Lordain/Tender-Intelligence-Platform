/**
 * Ingests a locally-saved DOF advanced-search response — the endpoint
 * that finally confirmed CFE tenders publish in DOF under a real,
 * identifiable section (see lib/ingestion/dof-search-mapper.ts).
 *
 * Usage:
 *   npm run ingest:dof-search -- --fixture
 *   npm run ingest:dof-search -- path/to/response.json [--write]
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readDofSearchFile } from "../lib/ingestion/connectors/dof-search-file";
import { mapDofSearchNotaToTender } from "../lib/ingestion/dof-search-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Diario Oficial de la Federación (DOF) — búsqueda avanzada";

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
    console.error("Usage: npm run ingest:dof-search -- <response.json> [--write]");
    console.error("   or: npm run ingest:dof-search -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-dof-search.json")
    : filePath!;

  const notas = readDofSearchFile(resolvedPath);
  const tenders = notas
    .map((n) => mapDofSearchNotaToTender(n, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} tender notice(s) of ${notas.length} notices in this response.`);

  if (useFixture || !shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
    return;
  }

  await upsertTenders(tenders);
}

main();
