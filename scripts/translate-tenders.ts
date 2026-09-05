/**
 * CLI wrapper around lib/ingestion/translate-all-tenders.ts — see that
 * file's header for what this actually does (es->zh title/summary
 * translation on Haiku 4.5, batched, for every non-excluded tender still
 * showing an untranslated() mirror). The admin "新项目清单" page's
 * "翻译所有标题" button does the same thing through a web form instead
 * of the terminal, via the same shared function.
 *
 * Skips tenders whose relevance_tier is "excluded" — no point spending
 * real API cost translating tenders the default feed never shows.
 *
 * Requires ANTHROPIC_API_KEY.
 *
 * Usage:
 *   npm run translate:tenders -- --limit 50            (dry run — prints what would be translated, no API calls)
 *   npm run translate:tenders -- --limit 50 --write     (translates up to 50 and writes to Supabase)
 *   npm run translate:tenders -- --write                (translates every untranslated, non-excluded tender)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { translateAllTenders } from "../lib/ingestion/translate-all-tenders";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const limitArg = argValue(args, "--limit");
  const limit = limitArg ? Number(limitArg) : undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY isn't set. See .env.example.");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await translateAllTenders(supabase, { write: shouldWrite, limit });

  console.log(`${result.untranslatedCount} of ${result.totalNonExcluded} non-excluded tenders still need translation.`);
  console.log(`Translating ${result.attemptedCount}...`);

  if (!shouldWrite) {
    console.log(JSON.stringify(result.sample, null, 2));
    if (result.attemptedCount > result.sample.length) console.log(`\n...and ${result.attemptedCount - result.sample.length} more.`);
    console.log("\ndry run (pass --write to actually translate and save) — no API calls made, nothing written.");
    return;
  }

  if (result.failedSlugs && result.failedSlugs.length > 0) {
    console.error(`Failed to translate: ${result.failedSlugs.join(", ")}`);
  }
  console.log(`Done. Translated ${result.translatedCount} of ${result.attemptedCount} tenders (${result.failedCount} failed).`);
}

main();
