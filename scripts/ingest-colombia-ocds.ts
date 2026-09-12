/**
 * FIRST REAL TEST of Colombia Compra Eficiente's own OCDS API
 * (api.colombiacompra.gov.co/releases/) — see
 * lib/ingestion/connectors/colombia-ocds-live.ts's header comment for why
 * this exists and what's unverified about it (response envelope shape,
 * whether real pagination exists beyond the start/finish date filter).
 *
 * Deliberately does NOT write to Supabase yet — this is purely a
 * fetch + map + print diagnostic run, so the console output can confirm
 * (or disprove) the response shape and mapping before any admin UI or
 * upsert logic gets built on top of it. Once a real run confirms the
 * shape, this graduates into a proper ingestColombiaOcds() lib function +
 * admin action, same shared-function pattern as every other source here.
 *
 * Usage:
 *   npm run ingest:colombia-ocds -- [--months 2]
 */
import { fetchColombiaOcdsReleases } from "../lib/ingestion/connectors/colombia-ocds-live";
import { mapOcdsReleaseToTender } from "../lib/ingestion/ocds-mapper";

const SOURCE_NAME = "Colombia Compra Eficiente — OCDS";
const SOURCE_URL_BASE = "https://api.colombiacompra.gov.co/releases/?ocid=";

function argNumber(args: string[], flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  return idx >= 0 ? Number(args[idx + 1]) : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const months = argNumber(args, "--months", 2);
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - months);

  console.log(`Fetching Colombia OCDS releases published since ${sinceDate.toISOString().slice(0, 10)}...`);
  const releases = await fetchColombiaOcdsReleases({ sinceDate });
  console.log(`Fetched ${releases.length} raw release(s).`);

  if (releases.length === 0) {
    console.log("\nNo releases returned — check the [diag] line above for the raw response shape.");
    return;
  }

  const pairs = releases
    .map((release) => ({ release, tender: mapOcdsReleaseToTender(release, SOURCE_NAME, SOURCE_URL_BASE, "Colombia") }))
    .filter((pair): pair is { release: (typeof releases)[number]; tender: NonNullable<(typeof pair)["tender"]> } => pair.tender !== null);
  console.log(`Mapped ${pairs.length} of ${releases.length} into real Tenders (nulls = missing title/buyer/date).`);

  console.log("\nFirst 3 mapped tenders (title / dates / documents / relevance):");
  for (const { release, tender } of pairs.slice(0, 3)) {
    console.log(`- ${tender.title.es}`);
    console.log(`  publicationDate=${tender.publicationDate} submissionDeadline=${tender.submissionDeadline ?? "(none)"}`);
    console.log(`  keyDates=${JSON.stringify(tender.keyDates.map((d) => d.type))}`);
    console.log(`  documents on the raw release=${release.tender?.documents?.length ?? 0}`);
    console.log(`  relevance=${tender.relevance.tier}`);
  }
}

main();
