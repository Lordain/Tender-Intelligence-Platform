/**
 * CLI wrapper around lib/ingestion/import-new-tenders.ts — see that
 * file's header for what this actually does (reads a locally-exported
 * "Difusión de procedimientos" file, maps it, filters to recent
 * publications, upserts to Supabase). The admin "新项目清单" page
 * (app/admin/import-tenders/) does the same thing through a web form
 * instead of the terminal, via the same shared function.
 *
 * Usage:
 *   npm run ingest:comprasmx-open -- --fixture                    (offline dry run)
 *   npm run ingest:comprasmx-open -- path/to/export.xlsx           (dry run against a real exported file)
 *   npm run ingest:comprasmx-open -- path/to/export.xlsx --write   (writes to Supabase)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { importNewTenders } from "../lib/ingestion/import-new-tenders";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:comprasmx-open -- <file.xlsx|file.csv> [--write]");
    console.error("   or: npm run ingest:comprasmx-open -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture ? join(__dirname, "../lib/ingestion/__fixtures__/sample-comprasmx-open-tenders.xlsx") : filePath!;
  const buffer = readFileSync(resolvedPath);

  const result = await importNewTenders(
    "comprasmx-open",
    { buffer, fileName: basename(resolvedPath) },
    { write: shouldWrite, months },
  );

  console.log(`Mapped ${result.mappedCount} of ${result.totalRows} rows.`);
  if (result.keptAfterRecencyCount !== result.mappedCount) {
    console.log(
      `Keeping ${result.keptAfterRecencyCount} of ${result.mappedCount} published within the last ${result.months} month(s) (pass --months 0 to disable).`,
    );
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(useFixture ? result.sample : result.sample, null, 2));
    if (!useFixture && result.keptAfterRecencyCount > result.sample.length) {
      console.log(`\n...and ${result.keptAfterRecencyCount - result.sample.length} more (showing first ${result.sample.length} of a real file's dry run).`);
    }
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
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
