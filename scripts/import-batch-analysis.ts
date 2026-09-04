/**
 * CLI wrapper around lib/ingestion/import-batch-analysis.ts — see that
 * file's header for what this actually does (merges a batch-analysis
 * export's per-document results by tender and writes them to Supabase).
 * The admin "导入分析结果" page (app/admin/import-analysis/) does the same
 * thing through a web form instead of the terminal, via the same shared
 * function.
 *
 * Accepts more than one export file so results from separate batch runs
 * (e.g. one document that was re-run alone later, per a slug missing from
 * an earlier run) merge into the same tender instead of one run's write
 * wiping out another's — always one delete-then-insert per tender using
 * ALL documents passed in, never per file.
 *
 * Usage:
 *   npm run import:batch-analysis -- <export.json> [<export2.json> ...]              (dry run — prints what would be written)
 *   npm run import:batch-analysis -- <export.json> [<export2.json> ...] --write
 *   npm run import:batch-analysis -- <export.json> [<export2.json> ...] --write --force  (write even over an existing claude-opus-5 result)
 */
import { readFileSync } from "node:fs";
import { importBatchAnalysis } from "../lib/ingestion/import-batch-analysis";
import type { TenderExtraction } from "../lib/ingestion/extract-requirements";

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const force = args.includes("--force");
  const exportPaths = args.filter((a) => !a.startsWith("--"));

  if (exportPaths.length === 0) {
    console.error("Usage: npm run import:batch-analysis -- <export.json> [<export2.json> ...] [--write] [--force]");
    process.exit(1);
  }

  const raws = exportPaths.map((p) => JSON.parse(readFileSync(p, "utf-8")) as Record<string, TenderExtraction>);
  const documentCount = raws.reduce((sum, r) => sum + Object.keys(r).length, 0);

  let results;
  try {
    results = await importBatchAnalysis(raws, { write: shouldWrite, force });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`${exportPaths.length} file(s), ${documentCount} document result(s) across ${results.length} tender(s).\n`);

  for (const r of results) {
    console.log(`${r.slug}: ${r.documentCount} document(s) -> ${r.qualifications} qualifications, ${r.experienceRequirements} experience, ${r.requiredDocuments} documents, ${r.risks} risks (merged/deduped)`);
    if (r.status === "tender-not-found") console.error(`  skipped — no ingested tender found for slug "${r.slug}": ${r.message}`);
    if (r.status === "skipped-opus-precision") console.error(`  skipped — this tender ${r.message}. Pass --force to overwrite it.`);
    if (r.status === "written") console.log(`  written.`);
  }

  if (!shouldWrite) {
    console.log("\ndry run (pass --write to record these in Supabase) — nothing was written.");
  }
}

main();
