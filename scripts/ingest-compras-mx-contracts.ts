/**
 * Ingests a locally-downloaded Compras MX "Datos Abiertos" contracts CSV
 * (comprasmx.buengobierno.gob.mx/datos-abiertos) into Supabase. This is the
 * confirmed-real, current-system export — see
 * lib/ingestion/compras-mx-contracts-mapper.ts for the verified column
 * schema and lib/ingestion/README.md for the contracts-vs-open-tenders
 * caveat (this data is awarded contracts, not tenders still open to bid).
 *
 * Usage:
 *   npm run ingest:comprasmx-contracts -- --fixture                    (offline dry run)
 *   npm run ingest:comprasmx-contracts -- path/to/file.csv              (dry run against a real downloaded file)
 *   npm run ingest:comprasmx-contracts -- path/to/file.csv --write      (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readComprasMxContractsFile } from "../lib/ingestion/connectors/compras-mx-contracts-bulk-file";
import { mapComprasMxContractRowToTender } from "../lib/ingestion/compras-mx-contracts-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Compras MX — Contratos (Datos Abiertos)";

async function upsertTenders(tenders: Tender[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  for (const tender of tenders) {
    const { keyDates, ...fields } = tender;

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
          scope_type: fields.scopeType,
          procedure_type: fields.procedureType,
          publication_date: fields.publicationDate,
          award_date: fields.awardDate ?? null,
          estimated_value: fields.estimatedValue ?? null,
          currency: fields.currency ?? null,
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
        keyDates.map((d) => ({ tender_id: tenderId, type: d.type, date: d.date })),
      );
    }

    console.log(`Upserted: ${fields.slug}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:comprasmx-contracts -- <file.csv> [--write]");
    console.error("   or: npm run ingest:comprasmx-contracts -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-compras-mx-contracts.csv")
    : filePath!;

  const rows = readComprasMxContractsFile(resolvedPath);
  const tenders = rows
    .map((row) => mapComprasMxContractRowToTender(row, SOURCE_NAME))
    .filter((t): t is Tender => t !== null);

  console.log(`Mapped ${tenders.length} of ${rows.length} rows.`);

  if (useFixture || !shouldWrite) {
    console.log(JSON.stringify(tenders, null, 2));
    console.log(`\n${useFixture ? "--fixture" : "dry run (pass --write to actually upsert)"} — nothing was written to Supabase.`);
    return;
  }

  await upsertTenders(tenders);
  console.log(`Done. Ingested ${tenders.length} tenders.`);
}

main();
