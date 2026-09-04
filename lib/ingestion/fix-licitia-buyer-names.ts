/**
 * Core logic behind the admin "LicitIA 刷新" section
 * (app/admin/import-tenders/) — one-off repair for tenders
 * discover-comprasmx-vigente.ts already wrote with a raw-code buyer name
 * (e.g. "073R96" instead of a real agency name). Straight extraction of
 * scripts/fix-licitia-buyer-names.ts's logic (that script is now a thin
 * wrapper around this function) — see that script's original header
 * comment for the full story (why every row is re-checked unconditionally,
 * not just ones that "look like" a raw code).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLicitacionDetail } from "@/lib/ingestion/connectors/licitia-connector";
import { resolveBuyerName } from "@/lib/ingestion/licitia-vigente-mapper";

const SOURCE_NAME = "LicitIA Abierto (espejo de ComprasMX/CompraNet Datos Abiertos)";

export type FixLicitiaBuyerNamesResult = {
  candidateCount: number;
  fixedCount: number;
  unchangedCount: number;
  write: boolean;
};

export async function fixLicitiaBuyerNames(supabase: SupabaseClient, options: { write: boolean }): Promise<FixLicitiaBuyerNamesResult> {
  const { data: rows, error } = await supabase.from("tenders").select("slug, tender_number, buyer").eq("source_name", SOURCE_NAME);
  if (error) throw new Error(`Failed to query tenders: ${error.message}`);

  console.log(`[fix-licitia-buyer-names] ${rows?.length ?? 0} tender(s) from this source — re-checking every one against the live detail API.`);

  let fixed = 0;
  let unchanged = 0;

  for (const row of rows ?? []) {
    const tenderNumber = row.tender_number as string;
    const slug = row.slug as string;
    const oldBuyer = row.buyer as string;

    const result = await fetchLicitacionDetail(tenderNumber);
    if (result.status !== "found") {
      console.log(`[fix-licitia-buyer-names]   [skip] ${slug} (${tenderNumber}) — detail lookup ${result.status}${result.status === "error" ? `: ${result.message}` : ""}`);
      continue;
    }

    const newBuyer = resolveBuyerName({ siglas: "", dependencia: "" } as never, result.detail) ?? oldBuyer;
    if (newBuyer === oldBuyer) {
      unchanged++;
      continue;
    }

    fixed++;
    console.log(`[fix-licitia-buyer-names]   [fix]  ${slug} (${tenderNumber}) — "${oldBuyer}" -> "${newBuyer}"`);
    if (options.write) {
      const { error: updateError } = await supabase.from("tenders").update({ buyer: newBuyer }).eq("slug", slug);
      if (updateError) console.error(`[fix-licitia-buyer-names]     failed to write: ${updateError.message}`);
    }
  }

  console.log(`[fix-licitia-buyer-names] ${fixed} fixable (${unchanged} left unchanged, no better name available).`);

  return { candidateCount: rows?.length ?? 0, fixedCount: fixed, unchangedCount: unchanged, write: options.write };
}
