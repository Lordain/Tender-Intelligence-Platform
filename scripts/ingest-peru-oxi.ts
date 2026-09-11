/**
 * Imports ProInversión's Obras por Impuestos convocatorias from the file the
 * "Exportar a Excel" button on investinperu.pe produces.
 *
 * Peru's third channel, alongside SEACE/OECE and the APP concessions — see
 * lib/ingestion/peru-oxi-mapper.ts for what it is, why it earns a place next
 * to SEACE (a real bid deadline, which OECE's data has none of), and the
 * Ley 29230 tax-offset mechanism every row carries a risk note about.
 *
 * The export is a snapshot of what is open right now, so there is no recency
 * filter: --months 0. A convocatoria that closes drops out of the next export
 * rather than ageing inside this one.
 *
 * With no file argument it fetches the export live, from the same endpoint the
 * site's own "Exportar a Excel" button calls — see peru-oxi-live.ts, including
 * why that path has never been exercised from this project's sandbox. Pass a
 * downloaded file to bypass the network entirely.
 *
 * Usage:
 *   npm run ingest:peru-oxi                           (fetch live, dry run)
 *   npm run ingest:peru-oxi -- --write
 *   npm run ingest:peru-oxi -- ListaConvocatoriaProceso_20260911.xlsx
 *   npm run ingest:peru-oxi -- ListaConvocatoriaProceso_20260911.xlsx --write
 *   npm run ingest:peru-oxi -- <file>.xlsx --days 5      (only convocatorias published in the last 5 days)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { downloadOxiExport } from "../lib/ingestion/connectors/peru-oxi-live";
import { importNewTenders } from "../lib/ingestion/import-new-tenders";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  let buffer: Buffer;
  let fileName: string;
  if (filePath) {
    buffer = readFileSync(filePath);
    fileName = basename(filePath);
  } else {
    console.log("Fetching the OxI export live from investinperu.pe...");
    buffer = await downloadOxiExport();
    fileName = `ListaConvocatoriaProceso_${new Date().toISOString().slice(0, 10)}.xlsx`;
    console.log(`  got ${(buffer.length / 1024).toFixed(0)} KB.`);
  }

  const result = await importNewTenders(
    "peru-oxi",
    { buffer, fileName },
    { write: shouldWrite, months: 0, days: Number(args[args.indexOf("--days") + 1]) || 0, preview: !shouldWrite },
  );

  console.log(`Mapped ${result.mappedCount} of ${result.totalRows} rows.`);

  if (!shouldWrite) {
    reportClassificationPreview(result.preview ?? result.sample, {
      examples: Number(args[args.indexOf("--examples") + 1]) || 25,
      label: "ingest-peru-oxi",
      exportBaseName: "peru-oxi-preview",
    });
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  if (result.failed && result.failed.length > 0) {
    console.error(`${result.failed.length} row(s) failed to upsert:`);
    for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${result.upsertedCount ?? 0} tender(s); skipped ${result.skippedExcludedCount ?? 0} excluded.`);
}

main();
