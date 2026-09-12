/**
 * CLI wrapper around lib/ingestion/import-new-tenders.ts — see that
 * file's header for what this actually does. Reuses Compras MX open-
 * tenders' exact file reader/mapper family since Proyectos Estratégicos
 * MX's export uses the exact same column format (see lib/ingestion/
 * proyectos-estrategicos-mapper.ts for the full story on why this is a
 * separate source, and lib/ingestion/README.md for the confirmed-
 * identical export column list). The admin "新项目清单" page
 * (app/admin/import-tenders/) does the same thing through a web form.
 *
 * Usage:
 *   npm run ingest:proyectos-estrategicos -- path/to/export.xlsx           (dry run against a real exported file)
 *   npm run ingest:proyectos-estrategicos -- path/to/export.xlsx --write   (writes to Supabase)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { importNewTenders } from "../lib/ingestion/import-new-tenders";

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: npm run ingest:proyectos-estrategicos -- <file.xlsx|file.csv> [--write]");
    process.exit(1);
  }

  const buffer = readFileSync(filePath);
  // No recency filter — this source's export carries no real publication-
  // date column at all (see the mapper's own header comment), so
  // filtering on it would be a no-op; --months 0 skips it entirely.
  const result = await importNewTenders(
    "proyectos-estrategicos",
    { buffer, fileName: basename(filePath) },
    { write: shouldWrite, months: 0 },
  );

  console.log(`Mapped ${result.mappedCount} of ${result.totalRows} rows.`);

  if (!shouldWrite) {
    console.log(JSON.stringify(result.sample, null, 2));
    if (result.keptAfterRecencyCount > result.sample.length) {
      console.log(`\n...and ${result.keptAfterRecencyCount - result.sample.length} more (showing first ${result.sample.length} of a real file's dry run).`);
    }
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  if (result.failed && result.failed.length > 0) {
    console.error(`${result.failed.length} row(s) failed to upsert:`);
    for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
    if (result.failed.length > 20) console.error(`  ...and ${result.failed.length - 20} more.`);
  }
  if (result.skippedExcludedCount) {
    console.log(`Skipped ${result.skippedExcludedCount} tender(s) classified "excluded" (routine service) — not written.`);
  }
  console.log(`Upserted ${result.upsertedCount} of ${result.keptAfterRecencyCount} mapped tenders.`);
}

main();
