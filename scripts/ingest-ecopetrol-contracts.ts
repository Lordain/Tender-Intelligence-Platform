/**
 * Ingests Ecopetrol's real "Contratación asignada a la fecha" export
 * (see lib/ingestion/connectors/ecopetrol-contracts-xlsb-file.ts for the
 * confirmed real, public — no login — source and file-shape findings).
 * This is Colombia's PEMEX-equivalent state oil company; the file is a
 * real awarded-contracts registry (one sheet per year), not open tenders.
 *
 * Usage:
 *   npm run ingest:ecopetrol-contracts -- --fixture                              (offline dry run)
 *   npm run ingest:ecopetrol-contracts -- path/to/contratacion.xlsb [--sheet 2026] (dry run against a real file)
 *   npm run ingest:ecopetrol-contracts -- path/to/contratacion.xlsb --write        (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readEcopetrolContractsFile } from "../lib/ingestion/connectors/ecopetrol-contracts-xlsb-file";
import { mapEcopetrolContractRowToTender } from "../lib/ingestion/ecopetrol-contracts-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Ecopetrol — Contratación asignada a la fecha";
const SOURCE_URL =
  "https://www.ecopetrol.com.co/wps/portal/Home/es/GruposInteres/GestionDeAbastecimiento/Gestioncontractual/ContratacionAsignadaFecha";

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

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--sheet" && args[i - 1] !== "--months");
  const sheet = argValue(args, "--sheet");
  const months = Number(argValue(args, "--months") ?? 6);

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:ecopetrol-contracts -- <contratacion.xlsb> [--sheet 2026] [--write]");
    console.error("   or: npm run ingest:ecopetrol-contracts -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-ecopetrol-contratacion.xlsb")
    : filePath!;

  const rows = readEcopetrolContractsFile(resolvedPath, sheet);
  const mappedTenders = rows
    .map((row) => mapEcopetrolContractRowToTender(row, SOURCE_NAME, SOURCE_URL))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${mappedTenders.length} of ${rows.length} rows.`);

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
