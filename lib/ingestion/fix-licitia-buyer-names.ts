/**
 * Core logic behind the admin "LicitIA 刷新" section's "修复采购单位名称"
 * button (app/admin/import-tenders/) — repair for tenders whose buyer name
 * is an unresolved raw code (e.g. "073R96", "081013") instead of a real
 * agency name/acronym.
 *
 * Originally scoped to only tenders whose source_name identified them as
 * coming from LicitIA's bulk "vigente" dump (discover-comprasmx-vigente.ts)
 * — but a real user report (2026-09-04) found the identical raw-code
 * problem on tenders ingested from the "Compras MX — 开放招标" manual
 * export (compras-mx-open-tenders-mapper.ts): that source's own "SIGLAS
 * DEPENDENCIA O ENTIDAD" column carries an unresolved raw code for the same
 * buyers LicitIA's bulk dump degrades to, and this button never touched
 * those rows since they don't carry the LicitIA source_name. Now scans
 * EVERY tender regardless of source_name.
 *
 * Deliberately does NOT pre-filter candidates by whether the stored buyer
 * "looks like" a raw code (e.g. contains a digit) before deciding what to
 * re-check — an earlier version of this script did exactly that and missed
 * a real case: a buyer stored as "ATTRAPI" (no digit at all, so it passed
 * as "looks fine") was still wrong. There's no way to tell from the stored
 * value alone whether it's a real acronym or bad data, so every row gets
 * re-checked against the live LicitIA detail API; resolveBuyerName's own
 * internal LOOKS_LIKE_RAW_CODE check (deciding whether a freshly-resolved
 * acronym is trustworthy) is unrelated to this and stays as-is.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLicitacionDetail } from "@/lib/ingestion/connectors/licitia-connector";
import { resolveBuyerName } from "@/lib/ingestion/licitia-vigente-mapper";

export type FixLicitiaBuyerNamesResult = {
  candidateCount: number;
  fixedCount: number;
  unchangedCount: number;
  write: boolean;
};

/** Same 1000-row-per-request PostgREST cap other full-table scans in this codebase page around (see lib/db/tenders.ts's SUPABASE_PAGE_SIZE comment) — this table is small today but there's no reason to silently truncate if it grows. */
const PAGE_SIZE = 1000;

export async function fixLicitiaBuyerNames(supabase: SupabaseClient, options: { write: boolean }): Promise<FixLicitiaBuyerNamesResult> {
  const rows: { slug: string; tender_number: string; buyer: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("tenders").select("slug, tender_number, buyer").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to query tenders: ${error.message}`);
    const page = (data ?? []) as { slug: string; tender_number: string; buyer: string }[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  console.log(`[fix-licitia-buyer-names] ${rows.length} tender(s) total (any source) — re-checking every one against the live LicitIA detail API.`);

  let fixed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const tenderNumber = row.tender_number;
    const slug = row.slug;
    const oldBuyer = row.buyer;

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

  return { candidateCount: rows.length, fixedCount: fixed, unchangedCount: unchanged, write: options.write };
}
