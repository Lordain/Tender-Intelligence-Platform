/**
 * Core logic behind the admin "LicitIA 刷新" section
 * (app/admin/import-tenders/) — backfills the real Compras MX detail-page
 * link onto already-ingested tenders that only ever got the generic
 * fallback search-page URL. Straight extraction of
 * scripts/resolve-comprasmx-links.ts's logic (that script is now a thin
 * wrapper around this function) — see that script's original header
 * comment / lib/ingestion/README.md for the full story.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveComprasMxDetailUrl } from "@/lib/ingestion/connectors/licitia-connector";

const GENERIC_SOURCE_URL = "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/";

// Same reasoning as discover-comprasmx-vigente.ts / the original script: a
// real systemic failure should stop the run loudly instead of grinding
// through hundreds more doomed requests with identical output.
const ERROR_CIRCUIT_BREAKER_THRESHOLD = 5;

export type ResolveComprasMxLinksResult = {
  candidateCount: number;
  resolvedCount: number;
  notFoundCount: number;
  errorCount: number;
  write: boolean;
};

export async function resolveComprasMxLinks(supabase: SupabaseClient, options: { write: boolean }): Promise<ResolveComprasMxLinksResult> {
  const { data: rows, error } = await supabase.from("tenders").select("slug, tender_number").eq("source_url", GENERIC_SOURCE_URL);
  if (error) throw new Error(`Failed to query tenders: ${error.message}`);

  if (!rows || rows.length === 0) {
    return { candidateCount: 0, resolvedCount: 0, notFoundCount: 0, errorCount: 0, write: options.write };
  }
  console.log(`[resolve-comprasmx-links] Found ${rows.length} tender(s) still on the generic fallback URL.`);

  let resolvedCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  let consecutiveErrors = 0;

  for (const row of rows) {
    const slug = row.slug as string;
    const tenderNumber = row.tender_number as string;

    const result = await resolveComprasMxDetailUrl(tenderNumber);

    if (result.status === "error") {
      console.error(`[resolve-comprasmx-links]   [error]     ${slug} (${tenderNumber}) — ${result.message}`);
      errorCount++;
      consecutiveErrors++;
      if (consecutiveErrors >= ERROR_CIRCUIT_BREAKER_THRESHOLD) {
        throw new Error(
          `${consecutiveErrors} requests in a row failed with an error (not "not found") — stopping early rather than repeating the same failure hundreds more times. This looks systemic (network/firewall/DNS reaching api.licitia.com.mx), not "these procedures aren't indexed."`,
        );
      }
      continue;
    }
    consecutiveErrors = 0;

    if (result.status === "not_found") {
      notFoundCount++;
      continue;
    }

    resolvedCount++;
    if (options.write) {
      const { error: updateError } = await supabase.from("tenders").update({ source_url: result.detailUrl }).eq("slug", slug);
      if (updateError) console.error(`[resolve-comprasmx-links]   failed to write ${slug}: ${updateError.message}`);
    }
  }

  console.log(`[resolve-comprasmx-links] Resolved ${resolvedCount} of ${rows.length} (${notFoundCount} not found in LicitIA's index, ${errorCount} errored).`);

  return { candidateCount: rows.length, resolvedCount, notFoundCount, errorCount, write: options.write };
}
