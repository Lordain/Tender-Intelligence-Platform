/**
 * Ingests a locally-saved export of a PEMEX subsidiary's "Concursos
 * Abiertos" SharePoint list (see lib/ingestion/pemex-mapper.ts and
 * README.md for how to capture one via the browser Console).
 *
 * Usage:
 *   npm run ingest:pemex -- --fixture
 *   npm run ingest:pemex -- path/to/items.json --buyer "Pemex Exploración y Producción" --list-title "Concursos-Abiertos-PEP" [--procedure-label "Concurso Abierto"] [--write]
 *
 * --list-title must match the real SharePoint list Title used to capture
 * the export (e.g. "Concursos-Abiertos-PEP", "Concursos-e-invitaciones")
 * — it's looked up against DISPLAY_FORM_PATH_BY_LIST_TITLE in
 * pemex-mapper.ts to build each tender's real sourceUrl. Omitting it (or
 * passing one the mapper doesn't recognize) still ingests fine, but
 * sourceUrl falls back to the generic list-browser page instead of a real
 * per-item deep link.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readPemexFile } from "../lib/ingestion/connectors/pemex-file";
import { mapPemexConcursoItemToTender } from "../lib/ingestion/pemex-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "PEMEX — Concursos Abiertos";

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
  const filePath = args.find(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--buyer" && args[i - 1] !== "--procedure-label" && args[i - 1] !== "--list-title",
  );
  const buyer = argValue(args, "--buyer") ?? "Petróleos Mexicanos (PEMEX)";
  const procedureLabel = argValue(args, "--procedure-label") ?? "Concurso Abierto";
  const listTitle = argValue(args, "--list-title") ?? "";
  const months = Number(argValue(args, "--months") ?? 6);

  if (!useFixture && !filePath) {
    console.error('Usage: npm run ingest:pemex -- <items.json> --buyer "Pemex Exploración y Producción" --list-title "Concursos-Abiertos-PEP" [--write]');
    console.error("   or: npm run ingest:pemex -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-pemex-pep.json")
    : filePath!;
  const resolvedBuyer = useFixture ? "Pemex Exploración y Producción" : buyer;
  const resolvedListTitle = useFixture ? "Concursos-Abiertos-PEP" : listTitle;

  const items = readPemexFile(resolvedPath);
  const mappedTenders = items
    .map((item) => mapPemexConcursoItemToTender(item, resolvedBuyer, SOURCE_NAME, resolvedListTitle, procedureLabel))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${mappedTenders.length} tender(s) of ${items.length} items in this export.`);
  const openCount = mappedTenders.filter((t) => t.status === "open").length;
  console.log(`${openCount} currently open (by vencimiento date), ${mappedTenders.length - openCount} expired.`);

  const tenders = filterRecentTenders(mappedTenders, months);
  if (tenders.length !== mappedTenders.length) {
    console.log(
      `Keeping ${tenders.length} of ${mappedTenders.length} published within the last ${months} month(s) (pass --months 0 to disable).`,
    );
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(useFixture ? tenders : tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
