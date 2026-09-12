/**
 * CLI for ProInversión's Obras por Impuestos convocatorias — thin wrapper
 * around lib/ingestion/ingest-peru.ts, same shared path the admin 秘鲁 tab
 * uses.
 *
 * With no file argument it fetches live from the endpoint the site's own
 * "Exportar a Excel" button calls (peru-oxi-live.ts). Pass a downloaded file
 * to bypass the network entirely.
 *
 * Usage:
 *   npm run ingest:peru-oxi                           (fetch live, dry run)
 *   npm run ingest:peru-oxi -- --write
 *   npm run ingest:peru-oxi -- --days 5
 *   npm run ingest:peru-oxi -- ListaConvocatoriaProceso_20260911.xlsx
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { ingestPeruOxi } from "../lib/ingestion/ingest-peru";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--") && /\.(xlsx|xls)$/i.test(a));
  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await ingestPeruOxi(
    supabase,
    {
      write,
      days: Number(argValue(args, "--days") ?? 0),
      preview: !write,
      file: filePath ? { buffer: readFileSync(filePath), fileName: basename(filePath) } : undefined,
    },
    (message) => console.log(message),
  );

  console.log(`Mapped ${result.mappedCount} of ${result.fetchedCount} rows.`);
  if (result.keptAfterRecencyCount !== result.mappedCount) {
    console.log(`Keeping ${result.keptAfterRecencyCount} of ${result.mappedCount} within the recency window.`);
  }

  if (!write) {
    reportClassificationPreview(result.preview ?? [], {
      examples: Number(argValue(args, "--examples") ?? 25),
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
