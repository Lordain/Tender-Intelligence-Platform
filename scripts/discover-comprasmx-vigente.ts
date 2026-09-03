/**
 * Discovers ComprasMX/CompraNet procedures currently open for bidding
 * ("vigente") directly via LicitIA's public bulk-download API — no manual
 * browser export needed. See lib/ingestion/connectors/licitia-connector.ts
 * for why LicitIA is used (a third-party mirror of ComprasMX's own official
 * "Datos Abiertos" open-data feed — confirmed 2026-09-03 via
 * https://licitia.com.mx/datos and
 * https://api.licitia.com.mx/api/open/v1/llms.txt — not a scrape of
 * ComprasMX's own anti-bot-gated detail API).
 *
 * Flow:
 *   1. Download every lote of /descargas/licitaciones/{lote} (NDJSON,
 *      confirmed real 2026-09-03: 15 lotes, 372,449 rows total across every
 *      status/year since 2022) and keep only seccion === "vigente".
 *   2. Skip any procedure number already in Supabase, from ANY source —
 *      not just this one. A tender already ingested via the manual
 *      ingest:comprasmx-open export has real Carácter/Tipo de contratación
 *      fields this bulk source doesn't carry; re-mapping it here would
 *      overwrite those with worse (defaulted) values.
 *   3. For each genuinely new one, resolve its real ComprasMX deep-link URL
 *      via resolveComprasMxDetailUrl() — the same function
 *      resolve-comprasmx-links.ts already uses, with the same
 *      not_found/error distinction and the same circuit breaker (a run
 *      that error-status's 5 times in a row stops rather than grinding
 *      through the rest doomed).
 *   4. Map + batch-upsert.
 *
 * This does NOT replace ingest:comprasmx-open — that manual path stays
 * useful for filters this feed doesn't expose (Carácter, Tipo de
 * contratación) and re-running it is still safe (same slug scheme, see
 * licitia-vigente-mapper.ts). This is a second, independent discovery path
 * meant to surface procedures the manual export missed.
 *
 * Usage:
 *   npm run discover:comprasmx-vigente               (dry run — report only)
 *   npm run discover:comprasmx-vigente -- --write     (writes to Supabase)
 *   npm run discover:comprasmx-vigente -- --months 0  (skip the recency filter)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchAllVigenteLicitaciones, resolveComprasMxDetailUrl } from "../lib/ingestion/connectors/licitia-connector";
import { mapLicitiaVigenteRowToTender } from "../lib/ingestion/licitia-vigente-mapper";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "LicitIA Abierto (espejo de ComprasMX/CompraNet Datos Abiertos)";
const FALLBACK_SOURCE_URL = "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/";

// Same reasoning as resolve-comprasmx-links.ts: a real systemic failure
// (network/firewall/DNS) should stop this run immediately instead of
// grinding through hundreds more doomed requests with identical output.
const ERROR_CIRCUIT_BREAKER_THRESHOLD = 5;

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 6;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  console.log("Downloading LicitIA's bulk licitaciones corpus (15 lotes, ~372k rows total)...");
  const vigenteRows = await fetchAllVigenteLicitaciones((lote, total) => {
    console.log(`  lote ${lote}/${total}...`);
  });
  console.log(`Found ${vigenteRows.length} procedure(s) currently marked "vigente".\n`);

  const { data: existingRows, error: existingError } = await supabase.from("tenders").select("tender_number");
  if (existingError) {
    console.error(`Failed to query existing tenders: ${existingError.message}`);
    process.exit(1);
  }
  const existingNumbers = new Set((existingRows ?? []).map((r) => (r.tender_number as string).toUpperCase()));

  const newRows = vigenteRows.filter((row) => !existingNumbers.has(row.numero.toUpperCase()));
  console.log(`${vigenteRows.length - newRows.length} already in Supabase (any source), ${newRows.length} new.\n`);

  const tenders: Tender[] = [];
  let resolvedLinks = 0;
  let consecutiveErrors = 0;

  for (const [i, row] of newRows.entries()) {
    const result = await resolveComprasMxDetailUrl(row.numero);

    if (result.status === "error") {
      console.error(`  [${i + 1}/${newRows.length}] error resolving link for ${row.numero} — ${result.message}`);
      consecutiveErrors++;
      if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
        console.error(
          `\n${consecutiveErrors} link lookups in a row failed with an error (not "not found") — stopping early. This looks systemic (network/firewall/DNS reaching api.licitia.com.mx), not "these procedures aren't indexed." Fix that first, then re-run — already-discovered rows aren't lost, they'll just be re-downloaded next run.`,
        );
        process.exit(1);
      }
    } else {
      consecutiveErrors = 0;
      if (result.status === "resolved") resolvedLinks++;
    }

    const sourceUrl = result.status === "resolved" ? result.detailUrl : FALLBACK_SOURCE_URL;
    const tender = mapLicitiaVigenteRowToTender(row, SOURCE_NAME, sourceUrl);
    if (tender) tenders.push(tender);

    if ((i + 1) % 50 === 0 || i + 1 === newRows.length) {
      console.log(`  resolved ${i + 1}/${newRows.length} (${resolvedLinks} with a real deep link so far)...`);
    }
  }

  console.log(`\nMapped ${tenders.length} of ${newRows.length} new rows (${resolvedLinks} with a real deep link).`);

  const recent = filterRecentTenders(tenders, months);
  if (recent.length !== tenders.length) {
    console.log(`Keeping ${recent.length} of ${tenders.length} published within the last ${months} month(s) (pass --months 0 to disable).`);
  }

  if (!shouldWrite) {
    console.log(JSON.stringify(recent.slice(0, 5), null, 2));
    if (recent.length > 5) console.log(`\n...and ${recent.length - 5} more (showing first 5).`);
    console.log("\ndry run (pass --write to actually upsert) — nothing was written to Supabase.");
    return;
  }

  const { upsertedCount, failed } = await upsertTendersBatched(supabase, recent, (done, total) => {
    console.log(`Upserted ${done}/${total}...`);
  });
  if (failed.length > 0) {
    console.error(`${failed.length} row(s) failed to upsert:`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
    if (failed.length > 20) console.error(`  ...and ${failed.length - 20} more.`);
  }
  console.log(`Upserted ${upsertedCount} of ${recent.length} mapped tenders.`);
}

main();
