/**
 * CLI wrapper around lib/ingestion/fix-licitia-buyer-names.ts — see that
 * file for the real logic; this only handles argv parsing, Supabase client
 * setup, and the final console summary. Same underlying function backs the
 * admin "LicitIA 刷新" section (app/admin/import-tenders/).
 *
 * One-off repair for tenders with a raw-code buyer name (e.g. "073R96",
 * "081013" instead of a real agency name) — seen both from
 * discover-comprasmx-vigente.ts and from the "Compras MX — 开放招标" manual
 * export (real user report 2026-09-04). Re-checks EVERY row in the table
 * unconditionally, not just ones whose stored buyer "looks like" a raw
 * code — a buyer stored as "ATTRAPI" (no digit) previously slipped past a
 * version of this that only checked for a digit, with no way to tell from
 * the stored value alone whether that's a real acronym or bad data.
 *
 * Usage:
 *   npm run fix:licitia-buyer-names               (dry run — report only)
 *   npm run fix:licitia-buyer-names -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fixLicitiaBuyerNames } from "../lib/ingestion/fix-licitia-buyer-names";

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  try {
    await fixLicitiaBuyerNames(supabase, { write: shouldWrite });
    if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
