/**
 * CLI wrapper around lib/ingestion/discover-comprasmx-vigente.ts — see that
 * file for the real logic; this only handles argv parsing, Supabase client
 * setup, and the final console summary. Same underlying function backs the
 * admin "LicitIA 刷新" section (app/admin/import-tenders/).
 *
 * See lib/ingestion/connectors/licitia-connector.ts for why LicitIA is
 * used (a third-party mirror of ComprasMX's own official "Datos Abiertos"
 * open-data feed — confirmed 2026-09-03, not a scrape of ComprasMX's own
 * anti-bot-gated detail API).
 *
 * Usage:
 *   npm run discover:comprasmx-vigente               (dry run — report only)
 *   npm run discover:comprasmx-vigente -- --write     (writes to Supabase)
 *   npm run discover:comprasmx-vigente -- --months 0  (skip the recency filter)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { discoverComprasMxVigente } from "../lib/ingestion/discover-comprasmx-vigente";

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  try {
    const result = await discoverComprasMxVigente(supabase, { write: shouldWrite, months });

    if (!shouldWrite) {
      console.log(JSON.stringify(result.sample, null, 2));
      if (result.keptAfterRecencyCount > 5) console.log(`\n...and ${result.keptAfterRecencyCount - 5} more (showing first 5).`);
      console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
      return;
    }

    if (result.failed && result.failed.length > 0) {
      console.error(`${result.failed.length} row(s) failed to upsert:`);
      for (const f of result.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
      if (result.failed.length > 20) console.error(`  ...and ${result.failed.length - 20} more.`);
    }
    console.log(`Upserted ${result.upsertedCount} of ${result.keptAfterRecencyCount} mapped tenders.`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
