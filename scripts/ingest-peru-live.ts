/**
 * Automated ingest for Peru's OECE open contracting data — discovers
 * which real monthly files exist via `GET /files`, downloads+unzips the
 * ones falling inside the recency window, maps them, and upserts. See
 * lib/ingestion/connectors/peru-oece-live.ts for the confirmed real,
 * unauthenticated endpoints; ingest-peru.ts is the manual/offline
 * fallback for a file a human already downloaded and unzipped.
 *
 * Usage:
 *   npm run ingest:peru-live -- [--months 6] [--source seace_v3]
 *   npm run ingest:peru-live -- --write
 */
import { listOeceFiles, downloadOeceRecordPackage } from "../lib/ingestion/connectors/peru-oece-live";
import { mapOeceRecordToTender } from "../lib/ingestion/peru-oece-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
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

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;
  const source = argValue(args, "--source") ?? "seace_v3";

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (months > 0 ? months : 6));
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;

  console.log(`Listing real OECE files (source=${source}) via /files...`);
  const matchingFiles: { year: string; month: string }[] = [];
  for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
    const results = await listOeceFiles(page);
    if (results.length === 0) break;
    for (const file of results) {
      if (file.source !== source) continue;
      const key = `${file.year}-${file.month}`;
      if (key >= cutoffKey) matchingFiles.push({ year: file.year, month: file.month });
    }
  }

  console.log(`Found ${matchingFiles.length} real file(s) within the last ${months} month(s): ${matchingFiles.map((f) => `${f.year}-${f.month}`).join(", ") || "(none)"}`);

  const allTenders: Tender[] = [];
  for (const { year, month } of matchingFiles) {
    console.log(`Downloading ${source}/${year}/${month}...`);
    try {
      const { records } = await downloadOeceRecordPackage(source, year, month);
      const mapped = records.map((record) => mapOeceRecordToTender(record, SOURCE_NAME)).filter((t): t is Tender => t !== null);
      console.log(`  mapped ${mapped.length} of ${records.length} records`);
      allTenders.push(...mapped);
    } catch (err) {
      console.error(`  failed to fetch ${year}/${month}: ${(err as Error).message}`);
    }
  }

  console.log(`Mapped ${allTenders.length} tender(s) total across ${matchingFiles.length} file(s).`);

  const tenders = filterRecentTenders(allTenders, months);
  if (tenders.length !== allTenders.length) {
    console.log(`Keeping ${tenders.length} of ${allTenders.length} published within the last ${months} month(s).`);
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(tenders.slice(0, 5), null, 2));
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
}

main();
