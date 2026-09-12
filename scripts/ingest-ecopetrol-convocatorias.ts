/**
 * Ingests Ecopetrol's real "Convocatorias públicas en Ley de Garantías"
 * table (see lib/ingestion/connectors/ecopetrol-convocatorias-file.ts for
 * the confirmed real, public — no login — source, the copy-paste intake
 * shape, and the important time-bounded-window caveat: this is NOT a
 * continuously live feed).
 *
 * Usage:
 *   npm run ingest:ecopetrol-convocatorias -- --fixture                         (offline dry run)
 *   npm run ingest:ecopetrol-convocatorias -- path/to/convocatorias.tsv          (dry run against a real copy-pasted table)
 *   npm run ingest:ecopetrol-convocatorias -- path/to/convocatorias.tsv --write  (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readEcopetrolConvocatoriasFile } from "../lib/ingestion/connectors/ecopetrol-convocatorias-file";
import { mapEcopetrolConvocatoriaRowToTender } from "../lib/ingestion/ecopetrol-convocatorias-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Ecopetrol — Convocatorias Públicas (Ley de Garantías)";
const SOURCE_URL = "https://proveedores.ecopetrol.com.co/es-ES/Convocatorias-p%C3%BAblicas-en-ley-de-garant%C3%ADas/";

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
    console.error("Usage: npm run ingest:ecopetrol-convocatorias -- <convocatorias.tsv> [--write]");
    console.error("   or: npm run ingest:ecopetrol-convocatorias -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-ecopetrol-convocatorias.tsv")
    : filePath!;

  const rows = readEcopetrolConvocatoriasFile(resolvedPath);
  const mappedTenders = rows
    .map((row) => mapEcopetrolConvocatoriaRowToTender(row, SOURCE_NAME, SOURCE_URL))
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
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
    return;
  }

  await upsertTenders(tenders);
}

main();
