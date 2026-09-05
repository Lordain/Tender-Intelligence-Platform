/**
 * CLI wrapper around lib/ingestion/resolve-comprasmx-links.ts — see that
 * file for the real logic; this only handles argv parsing, Supabase client
 * setup, and the final console summary. Same underlying function backs the
 * admin "LicitIA 刷新" section (app/admin/import-tenders/).
 *
 * Backfills the real Compras MX detail-page link (the one with the
 * internal database id, e.g. .../detalle/<id>/procedimiento) onto
 * already-ingested tenders that only ever got the generic Compras MX
 * search-page fallback — every tender ingested via ingest:comprasmx-open
 * before this existed, since that source's own export carries no deep-link
 * column. Resolves each one via LicitIA's public API.
 *
 * Usage:
 *   npm run resolve:comprasmx-links               (dry run — report only)
 *   npm run resolve:comprasmx-links -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { resolveComprasMxLinks } from "../lib/ingestion/resolve-comprasmx-links";

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  try {
    const result = await resolveComprasMxLinks(supabase, { write: shouldWrite });
    if (result.candidateCount === 0) {
      console.log("No tenders with the generic Compras MX fallback URL found — nothing to backfill.");
      return;
    }
    if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
