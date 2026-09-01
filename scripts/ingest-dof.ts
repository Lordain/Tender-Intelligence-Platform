/**
 * Ingests a locally-saved DOF (Diario Oficial de la Federación)
 * daily-edition JSON response — real, structured, confirmed against
 * captures the user provided (see lib/ingestion/dof-mapper.ts). Most
 * notices aren't tenders (DOF is a general federal gazette); this maps
 * only the ones matching tender-title keywords.
 *
 * Usage:
 *   npm run ingest:dof -- --fixture                 (offline dry run)
 *   npm run ingest:dof -- path/to/response.json      (dry run against a real capture)
 *   npm run ingest:dof -- path/to/response.json --write
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readDofNotasFile } from "../lib/ingestion/connectors/dof-file";
import { mapDofNotaToTender } from "../lib/ingestion/dof-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Diario Oficial de la Federación (DOF)";

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
    console.error("Usage: npm run ingest:dof -- <response.json> [--write]");
    console.error("   or: npm run ingest:dof -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-dof-notas.json")
    : filePath!;

  const notas = readDofNotasFile(resolvedPath);
  const tenders = notas
    .map((n) => mapDofNotaToTender(n, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} tender notice(s) of ${notas.length} total notices.`);

  if (!shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
