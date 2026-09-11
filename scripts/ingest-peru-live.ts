/**
 * Automated ingest for Peru's OECE open contracting data.
 *
 * TWO PATHS, and the default changed on 2026-09-11:
 *
 *   API (default) — `/recordsAfter?dataSegmentationID=YYYY-MM`, the live
 *   index. Confirmed against the real endpoint that day: a 2026-09 query
 *   returned records published 2026-09-09 and compiled 2026-09-10, i.e.
 *   roughly ONE DAY of lag.
 *
 *   Bulk (`--bulk`) — the older `/files` + monthly ZIP path. Kept because it
 *   is a genuinely independent route to the same data if the API changes,
 *   but it can only ever serve COMPLETE calendar months: the current month is
 *   invisible for its whole duration, so a tender published on the 1st waits
 *   ~30 days. The user called that unacceptable, which is why it is no longer
 *   the default.
 *
 * ingest-peru.ts remains the manual/offline path for a ZIP a human unzipped.
 *
 * Usage:
 *   npm run ingest:peru-live                          (last 2 segments, dry run)
 *   npm run ingest:peru-live -- --months 3 --write
 *   npm run ingest:peru-live -- --segment 2026-09     (one specific month)
 *   npm run ingest:peru-live -- --bulk --months 6     (the old monthly-file path)
 *   npm run ingest:peru-live -- --json                (raw Tender objects instead of the review report)
 *
 * A dry run prints a classification REPORT, not rows: one real segment is
 * ~4000 records and the first five of those tell you nothing about whether
 * the rules are right. It also writes the same two review CSVs
 * reclassify-tenders.ts writes, so `npm run explain:kept -- <that file>`
 * answers "which rule kept these?" before anything reaches Supabase.
 */
import {
  listOeceFiles,
  downloadOeceRecordPackage,
  fetchOeceRecordsForSegment,
  recentSegmentIds,
} from "../lib/ingestion/connectors/peru-oece-live";
import { mapOeceRecordToTender } from "../lib/ingestion/peru-oece-mapper";
import type { OeceRecord } from "../lib/ingestion/peru-oece-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import { reportClassificationPreview } from "../lib/ingestion/preview-report";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "OECE — Organismo Especializado para las Contrataciones Públicas Eficientes (Perú)";
const MAX_LISTING_PAGES = 5;

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function upsertTenders(tenders: Tender[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  const { upsertedCount, failed } = await upsertTendersBatched(supabase, tenders, (done, total) => {
    console.log(`Upserted ${done}/${total}...`);
  });
  if (failed.length > 0) {
    console.error(`${failed.length} row(s) failed to upsert:`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  console.log(`Upserted ${upsertedCount} of ${tenders.length} mapped tenders.`);
}

/** The live-index path. Segments are fetched newest-month first. */
async function collectViaApi(args: string[], months: number, sourceId: string): Promise<OeceRecord[]> {
  const explicitSegment = argValue(args, "--segment");
  const segments = explicitSegment ? [explicitSegment] : recentSegmentIds(months);
  const category = argValue(args, "--category") as "goods" | "works" | "services" | undefined;

  console.log(
    `Fetching OECE segments via /recordsAfter (source=${sourceId}${category ? `, category=${category}` : ""}): ${segments.join(", ")}`,
  );

  const records: OeceRecord[] = [];
  for (const segment of segments) {
    const fetched = await fetchOeceRecordsForSegment(
      { dataSegmentationId: segment, sourceId, mainProcurementCategory: category },
      (page, soFar) => {
        // Progress only every 10 pages: a busy month runs to hundreds of
        // pages and a line each would bury the summary.
        if (page === 1 || page % 10 === 0) console.log(`  ${segment}: page ${page}, ${soFar} record(s) so far...`);
      },
    );
    console.log(`  ${segment}: ${fetched.length} record(s).`);
    records.push(...fetched);
  }
  return records;
}

/** The older monthly-ZIP path — see this file's header for why it is not the default. */
async function collectViaBulk(months: number, sourceId: string): Promise<OeceRecord[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (months > 0 ? months : 6));
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;

  console.log(`Listing real OECE files (source=${sourceId}) via /files...`);
  const matchingFiles: { year: string; month: string }[] = [];
  for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
    const results = await listOeceFiles(page);
    if (results.length === 0) break;
    for (const file of results) {
      if (file.source !== sourceId) continue;
      if (`${file.year}-${file.month}` >= cutoffKey) matchingFiles.push({ year: file.year, month: file.month });
    }
  }
  console.log(
    `Found ${matchingFiles.length} real file(s) within the last ${months} month(s): ${matchingFiles.map((f) => `${f.year}-${f.month}`).join(", ") || "(none)"}`,
  );

  const records: OeceRecord[] = [];
  for (const { year, month } of matchingFiles) {
    console.log(`Downloading ${sourceId}/${year}/${month}...`);
    try {
      const pkg = await downloadOeceRecordPackage(sourceId, year, month);
      console.log(`  ${pkg.records.length} record(s)`);
      records.push(...pkg.records);
    } catch (err) {
      console.error(`  failed to fetch ${year}/${month}: ${(err as Error).message}`);
    }
  }
  return records;
}


async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const useBulk = args.includes("--bulk");
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : useBulk ? 6 : 2;
  const sourceId = argValue(args, "--source") ?? "seace_v3";

  const records = useBulk ? await collectViaBulk(months, sourceId) : await collectViaApi(args, months, sourceId);

  const allTenders = records
    .map((record) => mapOeceRecordToTender(record, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);
  console.log(`Mapped ${allTenders.length} tender(s) from ${records.length} record(s).`);

  // A segment holds tenders whose CONVOCATORIA started that month, which is
  // not quite "published within N months" — so the recency filter still runs
  // over the mapped rows, exactly as the bulk path always did.
  const tenders = filterRecentTenders(allTenders, months);
  if (tenders.length !== allTenders.length) {
    console.log(`Keeping ${tenders.length} of ${allTenders.length} published within the last ${months} month(s).`);
  }

  if (!shouldWrite) {
    if (args.includes("--json")) {
      console.log(JSON.stringify(tenders.slice(0, 5), null, 2));
    } else {
      reportClassificationPreview(tenders, {
        examples: Number(argValue(args, "--examples") ?? 25),
        label: "ingest-peru-live",
        exportBaseName: "peru-preview",
      });
    }
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
