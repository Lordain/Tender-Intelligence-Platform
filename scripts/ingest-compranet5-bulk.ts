/**
 * Ingests a locally-downloaded CompraNet 5.0 historical bulk export (CSV or
 * XLSX from comprasmx.buengobierno.gob.mx/datos-abiertos) into Supabase.
 *
 * Usage:
 *   npm run ingest:compranet5 -- --fixture                      (offline dry run against the sample fixture, prints mapped output, doesn't write)
 *   npm run ingest:compranet5 -- path/to/downloaded-file.xlsx    (dry run against a real downloaded file — prints output, doesn't write)
 *   npm run ingest:compranet5 -- path/to/downloaded-file.xlsx --write   (writes to Supabase)
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readCompranet5BulkFile } from "../lib/ingestion/connectors/compranet5-bulk-file";
import { mapCompranet5RowToTender } from "../lib/ingestion/compranet5-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import type { Tender } from "../types/tender";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "Histórico de CompraNet 5.0 — Compras MX (Datos Abiertos)";
const SOURCE_URL_BASE = "https://historico-compranet.buengobierno.gob.mx/expediente/";

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
    await supabase.from("tender_key_dates").insert(
      keyDates.map((d) => ({ tender_id: tenderId, type: d.type, date: d.date })),
    );

    console.log(`Upserted: ${fields.slug}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const useFixture = args.includes("--fixture");
  const shouldWrite = args.includes("--write");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!useFixture && !filePath) {
    console.error("Usage: npm run ingest:compranet5 -- <file.csv|file.xlsx> [--write]");
    console.error("   or: npm run ingest:compranet5 -- --fixture");
    process.exit(1);
  }

  const resolvedPath = useFixture
    ? join(__dirname, "../lib/ingestion/__fixtures__/sample-compranet5-row.csv")
    : filePath!;

  const rows = await readCompranet5BulkFile(resolvedPath);
  const tenders = rows
    .map((row) => mapCompranet5RowToTender(row, SOURCE_NAME, SOURCE_URL_BASE))
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
