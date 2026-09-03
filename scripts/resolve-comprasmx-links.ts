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

// A real run against 526 tenders came back 0 resolved with every single
// one silently swallowed as "not found" (2026-09-03) - traced to
// resolveComprasMxDetailUrl() not distinguishing a real "not indexed"
// from every other failure mode. If the same systemic problem recurs
// (a firewall/proxy blocking this host, a DNS issue, etc.), erroring
// out immediately on the first several failures is far more useful than
// burning through hundreds of doomed requests and a wall of identical
// output before the user notices.
const ERROR_CIRCUIT_BREAKER_THRESHOLD = 5;

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
  let errorCount = 0;
  let consecutiveErrors = 0;

  for (const row of rows) {
    const slug = row.slug as string;
    const tenderNumber = row.tender_number as string;

    const result = await resolveComprasMxDetailUrl(tenderNumber);

    if (result.status === "error") {
      console.error(`  [error]     ${slug} (${tenderNumber}) — ${result.message}`);
      errorCount++;
      consecutiveErrors++;
      if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
        console.error(
          `\n${consecutiveErrors} requests in a row failed with an error (not "not found") — stopping early rather than repeating the same failure hundreds more times. This looks systemic (network/firewall/DNS on this machine reaching api.licitia.com.mx), not "these procedures aren't indexed." Fix that first, then re-run.`,
        );
        process.exit(1);
      }
      continue;
    }
    consecutiveErrors = 0;

    if (result.status === "not_found") {
      console.log(`  [not found] ${slug} (${tenderNumber}) — not in LicitIA's index yet`);
      notFoundCount++;
      continue;
    }

    console.log(`  [resolved]  ${slug} (${tenderNumber}) -> ${result.detailUrl}`);
    resolvedCount++;

    if (shouldWrite) {
      const { error: updateError } = await supabase.from("tenders").update({ source_url: result.detailUrl }).eq("slug", slug);
      if (updateError) console.error(`    failed to write: ${updateError.message}`);
    }
  }

  console.log(`\nResolved ${resolvedCount} of ${rows.length} (${notFoundCount} not found in LicitIA's index, ${errorCount} errored).`);
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
