/**
 * Ingests tenders from Compras MX's OCDS feed into Supabase.
 *
 * Usage:
 *   npm run ingest:compras-mx -- --fixture   (offline dry run against the sample fixture, prints mapped output, doesn't write)
 *   npm run ingest:compras-mx               (live — requires COMPRAS_MX_OCDS_API_URL; see lib/ingestion/README.md)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapOcdsReleaseToTender } from "../lib/ingestion/ocds-mapper";
import { createComprasMxConnector } from "../lib/ingestion/connectors/compras-mx-connector";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import type { OcdsReleasePackage } from "../lib/ingestion/types";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Contrataciones Abiertas (OCDS) — Compras MX";
const SOURCE_URL_BASE = "https://www.gob.mx/contratacionesabiertas/release/";

async function loadFixtureReleases() {
  const fixturePath = join(__dirname, "../lib/ingestion/__fixtures__/sample-ocds-release.json");
  const pkg = JSON.parse(readFileSync(fixturePath, "utf-8")) as OcdsReleasePackage;
  return pkg.releases;
}

async function upsertTenders(tenders: Tender[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  for (const tender of tenders) {
    const { qualifications, experienceRequirements, requiredDocuments, keyDates, risks, ...fields } = tender;

    // Deliberately omit `id` from the payload: on insert, Postgres uses the
    // column default (gen_random_uuid()); on conflict (an existing slug),
    // the existing row's id is left untouched since it's not in the SET list.
    const { data: upserted, error: tenderError } = await supabase
      .from("tenders")
      .upsert(
        {
          slug: fields.slug,
          tender_number: fields.tenderNumber,
          title: fields.title,
          summary: fields.summary,
          buyer: fields.buyer,
          country: fields.country,
          government_level: fields.governmentLevel,
          industry: fields.industry,
          subcategory: fields.subcategory ?? null,
          scope_type: fields.scopeType,
          procedure_type: fields.procedureType,
          publication_date: fields.publicationDate,
          submission_deadline: fields.submissionDeadline ?? null,
          award_date: fields.awardDate ?? null,
          estimated_value: fields.estimatedValue ?? null,
          currency: fields.currency ?? null,
          location: fields.location ?? null,
          status: fields.status,
          source_name: fields.sourceName,
          source_url: fields.sourceUrl,
          updated_at: fields.updatedAt,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();

    if (tenderError || !upserted) {
      console.error(`Failed to upsert ${fields.slug}:`, tenderError?.message);
      continue;
    }

    const tenderId = upserted.id as string;

    await supabase.from("tender_key_dates").delete().eq("tender_id", tenderId);
    if (keyDates.length > 0) {
      await supabase.from("tender_key_dates").insert(
        keyDates.map((d) => ({
          tender_id: tenderId,
          type: d.type,
          date: d.date,
          mandatory: d.mandatory ?? null,
          notes: d.notes ?? null,
        })),
      );
    }

    // qualifications/experienceRequirements/requiredDocuments/risks are
    // intentionally left untouched here — they're empty from the mapper
    // (see ocds-mapper.ts) since extracting them needs Layer 2 (AI reading
    // attached documents), not built yet. Re-ingesting doesn't wipe out
    // requirements a human or a future AI pass added directly in Supabase.
    void qualifications;
    void experienceRequirements;
    void requiredDocuments;
    void risks;

    console.log(`Upserted: ${fields.slug}`);
  }
}

async function main() {
  const useFixture = process.argv.includes("--fixture");
  const releases = useFixture ? await loadFixtureReleases() : await createComprasMxConnector().fetchReleases();

  const tenders = releases
    .map((release) => mapOcdsReleaseToTender(release, SOURCE_NAME, SOURCE_URL_BASE))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} of ${releases.length} releases.`);

  if (useFixture) {
    console.log(JSON.stringify(tenders, null, 2));
    console.log("\n--fixture is a dry run — nothing was written to Supabase.");
    return;
  }

  await upsertTenders(tenders);
  console.log(`Done. Ingested ${tenders.length} tenders.`);
}

main();
