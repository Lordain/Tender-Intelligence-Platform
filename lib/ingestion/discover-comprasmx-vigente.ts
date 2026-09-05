/**
 * Core logic behind the admin "LicitIA 刷新" section
 * (app/admin/import-tenders/) — discovers ComprasMX/CompraNet procedures
 * currently open for bidding ("vigente") directly via LicitIA's public
 * bulk-download API, no manual browser export needed. This is a straight
 * extraction of scripts/discover-comprasmx-vigente.ts's logic (that script
 * is now a thin wrapper around this function) — see
 * lib/ingestion/connectors/licitia-connector.ts and lib/ingestion/README.md
 * for why LicitIA is used, and the same real gotchas that script's header
 * comment documented (skip anything already in Supabase from any source,
 * fetchLicitacionDetail() also resolves the buyer name for a bulk row whose
 * own siglas/dependencia can be a raw code, etc.).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllVigenteLicitaciones, fetchLicitacionDetail, buildComprasMxDetailUrl } from "@/lib/ingestion/connectors/licitia-connector";
import { mapLicitiaVigenteRowToTender } from "@/lib/ingestion/licitia-vigente-mapper";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";
import { filterRecentTenders } from "@/lib/ingestion/recency";
import type { Tender } from "@/types/tender";

const SOURCE_NAME = "LicitIA Abierto (espejo de ComprasMX/CompraNet Datos Abiertos)";
const FALLBACK_SOURCE_URL = "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/";

// Same reasoning as resolve-comprasmx-links.ts: a real systemic failure
// (network/firewall/DNS) should stop this run immediately instead of
// grinding through hundreds more doomed requests with identical output.
const ERROR_CIRCUIT_BREAKER_THRESHOLD = 5;

export type DiscoverComprasMxVigenteResult = {
  vigenteCount: number;
  newCount: number;
  mappedCount: number;
  resolvedLinksCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  protectedCount?: number;
  skippedManuallyDeletedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: Tender[];
};

export async function discoverComprasMxVigente(
  supabase: SupabaseClient,
  options: { write: boolean; months?: number },
): Promise<DiscoverComprasMxVigenteResult> {
  const months = options.months ?? 6;

  console.log("[discover-comprasmx-vigente] Downloading LicitIA's bulk licitaciones corpus (15 lotes, ~372k rows total)...");
  const vigenteRows = await fetchAllVigenteLicitaciones((lote, total) => {
    console.log(`[discover-comprasmx-vigente]   lote ${lote}/${total}...`);
  });
  console.log(`[discover-comprasmx-vigente] Found ${vigenteRows.length} procedure(s) currently marked "vigente".`);

  const { data: existingRows, error: existingError } = await supabase.from("tenders").select("tender_number");
  if (existingError) {
    throw new Error(`Failed to query existing tenders: ${existingError.message}`);
  }
  const existingNumbers = new Set((existingRows ?? []).map((r) => (r.tender_number as string).toUpperCase()));

  const newRows = vigenteRows.filter((row) => !existingNumbers.has(row.numero.toUpperCase()));
  console.log(`[discover-comprasmx-vigente] ${vigenteRows.length - newRows.length} already in Supabase (any source), ${newRows.length} new.`);

  const tenders: Tender[] = [];
  let resolvedLinks = 0;
  let consecutiveErrors = 0;

  for (const [i, row] of newRows.entries()) {
    // One request gets both the deep-link id AND buyer.agency/buyer.acronym
    // — see resolveBuyerName() in licitia-vigente-mapper.ts.
    const result = await fetchLicitacionDetail(row.numero);

    if (result.status === "error") {
      console.error(`[discover-comprasmx-vigente]   [${i + 1}/${newRows.length}] error resolving detail for ${row.numero} — ${result.message}`);
      consecutiveErrors++;
      if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
        throw new Error(
          `${consecutiveErrors} detail lookups in a row failed with an error (not "not found") — stopping early. This looks systemic (network/firewall/DNS reaching api.licitia.com.mx), not "these procedures aren't indexed." Already-discovered rows aren't lost, they'll just be re-downloaded next run.`,
        );
      }
    } else {
      consecutiveErrors = 0;
      if (result.status === "found") resolvedLinks++;
    }

    const sourceUrl = result.status === "found" ? buildComprasMxDetailUrl(result.detail.id) : FALLBACK_SOURCE_URL;
    const detail = result.status === "found" ? result.detail : undefined;
    const tender = mapLicitiaVigenteRowToTender(row, SOURCE_NAME, sourceUrl, detail);
    if (tender) tenders.push(tender);

    if ((i + 1) % 50 === 0 || i + 1 === newRows.length) {
      console.log(`[discover-comprasmx-vigente]   resolved ${i + 1}/${newRows.length} (${resolvedLinks} with a real deep link so far)...`);
    }
  }

  const recent = filterRecentTenders(tenders, months);
  console.log(
    `[discover-comprasmx-vigente] Mapped ${tenders.length} of ${newRows.length} new rows (${resolvedLinks} with a real deep link); keeping ${recent.length} within the last ${months || "unlimited"} month(s).`,
  );

  const result: DiscoverComprasMxVigenteResult = {
    vigenteCount: vigenteRows.length,
    newCount: newRows.length,
    mappedCount: tenders.length,
    resolvedLinksCount: resolvedLinks,
    keptAfterRecencyCount: recent.length,
    months,
    sample: recent.slice(0, 5),
  };

  if (!options.write) return result;

  const { upsertedCount, skippedExcludedCount, protectedCount, skippedManuallyDeletedCount, failed } = await upsertTendersBatched(
    supabase,
    recent,
    (done, total) => console.log(`[discover-comprasmx-vigente] Upserted ${done}/${total}...`),
  );
  return { ...result, upsertedCount, skippedExcludedCount, protectedCount, skippedManuallyDeletedCount, failed };
}
