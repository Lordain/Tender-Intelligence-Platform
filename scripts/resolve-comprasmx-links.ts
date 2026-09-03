/**
 * Backfills the real Compras MX detail-page link (the one with the
 * internal database id, e.g. .../detalle/<id>/procedimiento) onto
 * already-ingested tenders that only ever got the generic Compras MX
 * search-page fallback — every tender ingested via ingest:comprasmx-open
 * before this existed (2026-09-03), since that source's own export
 * carries no deep-link column (see
 * lib/ingestion/compras-mx-open-tenders-mapper.ts / README.md "The
 * open-tenders-vs-contracts gap"). Resolves each one via LicitIA's
 * public API (lib/ingestion/connectors/licitia-connector.ts) — a
 * user-found, free, read-only, no-key third-party mirror of Compras MX's
 * own open data.
 *
 * Read-only investigation by default; only writes to Supabase with
 * --write. A procedure LicitIA hasn't indexed yet (it syncs from Compras
 * MX daily, not instantly) is reported as not found, not an error — the
 * tender simply keeps its current fallback URL.
 *
 * Run this once now to fix already-ingested rows, and again after each
 * future `npm run ingest:comprasmx-open -- <file> --write` to backfill
 * the newly-ingested batch too (this hasn't been wired into that ingest
 * script itself — kept as a separate, explicit step, the same way
 * document extraction is separate from ingestion in this project).
 *
 * Usage:
 *   npm run resolve:comprasmx-links               (dry run — report only)
 *   npm run resolve:comprasmx-links -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { resolveComprasMxDetailUrl } from "../lib/ingestion/connectors/licitia-connector";

const GENERIC_SOURCE_URL = "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/";

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("tenders")
    .select("slug, tender_number")
    .eq("source_url", GENERIC_SOURCE_URL);

  if (error) {
    console.error(`Failed to query tenders: ${error.message}`);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log("No tenders with the generic Compras MX fallback URL found — nothing to backfill.");
    return;
  }

  console.log(`Found ${rows.length} tender(s) still on the generic fallback URL.\n`);

  let resolvedCount = 0;
  let notFoundCount = 0;

  for (const row of rows) {
    const slug = row.slug as string;
    const tenderNumber = row.tender_number as string;

    const detailUrl = await resolveComprasMxDetailUrl(tenderNumber);
    if (!detailUrl) {
      console.log(`  [not found] ${slug} (${tenderNumber}) — not in LicitIA's index yet`);
      notFoundCount++;
      continue;
    }

    console.log(`  [resolved]  ${slug} (${tenderNumber}) -> ${detailUrl}`);
    resolvedCount++;

    if (shouldWrite) {
      const { error: updateError } = await supabase.from("tenders").update({ source_url: detailUrl }).eq("slug", slug);
      if (updateError) console.error(`    failed to write: ${updateError.message}`);
    }
  }

  console.log(`\nResolved ${resolvedCount} of ${rows.length} (${notFoundCount} not found in LicitIA's index).`);
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
