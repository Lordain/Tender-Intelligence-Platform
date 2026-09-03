/**
 * Ingests a locally-exported "Información Pública" file from Proyectos
 * Estratégicos MX (proyectosestrategicosmx.hacienda.gob.mx) — a Hacienda-
 * run procurement portal for projects under the "Ley para el Fomento de
 * la Inversión en Infraestructura Estratégica para el Desarrollo con
 * Bienestar." Its export uses the exact same column format as Compras
 * MX's "Difusión de procedimientos" export, so this reuses that reader
 * verbatim — see lib/ingestion/proyectos-estrategicos-mapper.ts for the
 * full story on why this is a separate source from both Compras MX and
 * "Proyectos México" (Banobras/SHCP), and why it supersedes the latter.
 *
 * Usage:
 *   npm run ingest:proyectos-estrategicos -- path/to/export.xlsx           (dry run against a real exported file)
 *   npm run ingest:proyectos-estrategicos -- path/to/export.xlsx --write   (writes to Supabase)
 */
import { readComprasMxOpenTendersFile } from "../lib/ingestion/connectors/compras-mx-open-tenders-file";
import { mapProyectosEstrategicosRowToTender } from "../lib/ingestion/proyectos-estrategicos-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "Proyectos Estratégicos MX (Hacienda)";
const SOURCE_URL = "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/";

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
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: npm run ingest:proyectos-estrategicos -- <file.xlsx|file.csv> [--write]");
    process.exit(1);
  }

  const rows = await readComprasMxOpenTendersFile(filePath);
  const tenders = rows
    .map((row) => mapProyectosEstrategicosRowToTender(row, SOURCE_NAME, SOURCE_URL))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} of ${rows.length} rows.`);

  if (!shouldWrite) {
    console.log(JSON.stringify(tenders.slice(0, 5), null, 2));
    if (tenders.length > 5) {
      console.log(`\n...and ${tenders.length - 5} more (showing first 5 of a real file's dry run).`);
    }
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
