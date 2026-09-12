/**
 * CLI for the Peru document-link backfill — thin wrapper around
 * lib/ingestion/ingest-peru.ts's backfillPeruDocumentLinks(), which the
 * 秘鲁 tab's local-only panel calls too, so the button and the terminal
 * write through exactly the same path.
 *
 * See that function for what it does and why it never touches the tenders
 * themselves.
 *
 * Runs on the operator's own machine, like every other SEACE call: Peru's
 * proxy refuses Vercel's datacenter range (README.md, "Peru SEACE is CLI-only
 * on a deployed instance").
 *
 * Usage:
 *   npm run backfill:peru-documents                       (last 2 segments, dry run)
 *   npm run backfill:peru-documents -- --months 6 --write
 *   npm run backfill:peru-documents -- --segment 2026-08 --write
 */
import { backfillPeruDocumentLinks } from "../lib/ingestion/ingest-peru";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const result = await backfillPeruDocumentLinks(
    supabase,
    {
      write,
      months: Number(argValue(args, "--months") ?? 2),
      segment: argValue(args, "--segment"),
      sourceId: argValue(args, "--source"),
    },
    (message) => console.log(`  ${message}`),
  );

  console.log(
    `\n${result.recordCount} record(s) scanned; ${result.tendersWithLinks} carry document links (${result.linkCount} link(s) in total).`,
  );

  if (!result.saved) {
    console.log("dry run (pass --write to record them) — nothing was written to Supabase.");
    return;
  }

  console.log(
    `Recorded ${result.saved.linkCount} link(s) across ${result.saved.tendersWithLinks} stored tender(s).` +
      ` ${result.saved.unmatchedSlugs} record(s) had links but no stored tender (excluded or outside the import window) — expected.`,
  );
  if (result.saved.failed.length > 0) {
    console.error(`${result.saved.failed.length} batch(es) failed:`);
    for (const failure of result.saved.failed) console.error(`  ${failure.slug}: ${failure.error}`);
  }
}

main();
