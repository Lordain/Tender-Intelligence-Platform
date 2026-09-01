/**
 * Ingests a locally-saved export of a PEMEX subsidiary's "Concursos
 * Abiertos" SharePoint list (see lib/ingestion/pemex-mapper.ts and
 * README.md for how to capture one via the browser Console).
 *
 * Usage:
 *   npm run ingest:pemex -- --fixture
 *   npm run ingest:pemex -- path/to/items.json --buyer "Pemex Exploración y Producción" [--write]
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readPemexFile } from "../lib/ingestion/connectors/pemex-file";
import { mapPemexConcursoItemToTender } from "../lib/ingestion/pemex-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "PEMEX — Concursos Abiertos";
const SOURCE_URL =
  "https://www.pemex.com/procura/procedimientos-de-contratacion/concursosabiertos";

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

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--buyer");
  const buyer = argValue(args, "--buyer") ?? "Petróleos Mexicanos (PEMEX)";

  if (!useFixture && !filePath) {
    console.error('Usage: npm run ingest:pemex -- <items.json> --buyer "Pemex Exploración y Producción" [--write]');
    console.error("   or: npm run ingest:pemex -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-pemex-pep.json")
    : filePath!;
  const resolvedBuyer = useFixture ? "Pemex Exploración y Producción" : buyer;

  const items = readPemexFile(resolvedPath);
  const tenders = items
    .map((item) => mapPemexConcursoItemToTender(item, resolvedBuyer, SOURCE_NAME, SOURCE_URL))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} tender(s) of ${items.length} items in this export.`);
  const openCount = tenders.filter((t) => t.status === "open").length;
  console.log(`${openCount} currently open (by vencimiento date), ${tenders.length - openCount} expired.`);

  if (useFixture || !shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
    return;
  }

  await upsertTenders(tenders);
}

main();
