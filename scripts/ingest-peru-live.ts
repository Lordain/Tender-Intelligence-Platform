/**
 * CLI for Peru's SEACE/OECE live index — thin wrapper around
 * lib/ingestion/ingest-peru.ts, which the admin 秘鲁 tab
 * (app/admin/import-tenders/peru) calls too, so the button and the terminal
 * write through exactly the same path.
 *
 * See that file and lib/ingestion/connectors/peru-oece-live.ts for what this
 * source is, the two API traps it guards against, and why the segments have
 * to be whole calendar months.
 *
 * The old --bulk path (monthly ZIPs via /files) is gone: it could only ever
 * serve COMPLETE months, so the current month was invisible for its whole
 * duration. scripts/ingest-peru.ts remains the offline path for a ZIP a human
 * unzipped, and the connector's listOeceFiles/downloadOeceRecordPackage are
 * still exported for it.
 *
 * Usage:
 *   npm run ingest:peru-live                          (last 2 segments, dry run)
 *   npm run ingest:peru-live -- --months 3 --write
 *   npm run ingest:peru-live -- --days 5              (routine top-up)
 *   npm run ingest:peru-live -- --segment 2026-09     (one specific month)
 *   npm run ingest:peru-live -- --json                (raw Tender objects instead of the report)
 *   npm run ingest:peru-live -- --refresh-open        (re-read the months our still-open tenders live in)
 *   npm run ingest:peru-live -- --refresh-open --write
 */
import { ingestPeruOece, refreshPeruOeceStatuses } from "../lib/ingestion/ingest-peru";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";
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

  // --refresh-open is a different job from an import and shares none of its
  // flags: it does not add tenders, and its segments come from the rows
  // already in the database rather than from a window. See
  // refreshPeruOeceStatuses().
  if (args.includes("--refresh-open")) {
    if (!supabase) {
      console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
      process.exit(1);
    }
    const refreshed = await refreshPeruOeceStatuses(
      supabase,
      { write, maxSegments: Number(argValue(args, "--max-segments") ?? 12) },
      (message) => console.log(`  ${message}`),
    );
    console.log(
      `${refreshed.openCount} Peru tender(s) still reading 招标中, across ${refreshed.segments.length + refreshed.skippedSegments} month segment(s).`,
    );
    if (refreshed.skippedSegments > 0) {
      console.log(`  only the newest ${refreshed.segments.length} were fetched — pass --max-segments to go further back.`);
    }
    console.log(`Re-read ${refreshed.matchedCount} of them from the source.`);
    if (refreshed.nowAwarded.length === 0) {
      console.log("None of them have been awarded yet.");
    } else {
      console.log(`${refreshed.nowAwarded.length} have been awarded since we last looked:`);
      for (const item of refreshed.nowAwarded.slice(0, 20)) console.log(`  ${item.slug} — ${item.title}`);
    }
    if (!write) {
      console.log("\ndry run (pass --write to apply these statuses) — nothing was written to Supabase.");
      return;
    }
    if (refreshed.failed && refreshed.failed.length > 0) {
      console.error(`${refreshed.failed.length} row(s) failed to upsert:`);
      for (const f of refreshed.failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
    }
    console.log(`Updated ${refreshed.upsertedCount ?? 0} tender(s).`);
    return;
  }

  const result = await ingestPeruOece(
    supabase,
    {
      write,
      months: Number(argValue(args, "--months") ?? 2),
      days: Number(argValue(args, "--days") ?? 0),
      segment: argValue(args, "--segment"),
      category: argValue(args, "--category") as "goods" | "works" | "services" | undefined,
      sourceId: argValue(args, "--source"),
      preview: !write,
    },
    (message) => console.log(`  ${message}`),
  );

  console.log(`Mapped ${result.mappedCount} tender(s) from ${result.fetchedCount} record(s).`);
  if (result.keptAfterRecencyCount !== result.mappedCount) {
    console.log(`Keeping ${result.keptAfterRecencyCount} of ${result.mappedCount} within the recency window.`);
  }

  if (!write) {
    if (args.includes("--json")) {
      console.log(JSON.stringify(result.sample, null, 2));
    } else {
      reportClassificationPreview(result.preview ?? [], {
        examples: Number(argValue(args, "--examples") ?? 25),
        label: "ingest-peru-live",
        exportBaseName: "peru-preview",
      });
    }
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
