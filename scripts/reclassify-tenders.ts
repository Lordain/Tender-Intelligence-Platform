/**
 * CLI wrapper around lib/ingestion/reclassify-tenders.ts — see that file
 * for the real logic; this only handles argv parsing, Supabase client
 * setup, and the final console summary. Same underlying function backs
 * the admin "重新分类" button (app/admin/import-tenders/).
 *
 * Usage:
 *   npm run reclassify:tenders                (dry run — exports CSVs, reports what would change, writes nothing to Supabase)
 *   npm run reclassify:tenders -- --write      (also updates/deletes in Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { reclassifyTenders } from "../lib/ingestion/reclassify-tenders";

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  try {
    const result = await reclassifyTenders(supabase, { write: shouldWrite });
    console.log(
      `\n${result.changedCount} of ${result.totalCount} tender(s) would change tier under the current rules (${result.nowExcludedCount} newly excluded, ${result.nowIncludedCount} newly rescued into the feed).`,
    );
    if (!shouldWrite) {
      console.log("\ndry run (pass --write to update relevance_tier/label/reason in Supabase, and delete anything now excluded) — nothing was written to Supabase.");
    } else {
      console.log(`\nUpdated ${result.updatedCount} row(s), deleted ${result.deletedCount} newly-excluded row(s) in Supabase (${result.failedCount} failed).`);
      if (result.protectedSkippedCount > 0) {
        console.log(`Left ${result.protectedSkippedCount} manually-protected row(s) untouched (see the "manually_protected" CSV column for which ones).`);
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
