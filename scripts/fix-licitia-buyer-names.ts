/**
 * One-off repair for tenders discover-comprasmx-vigente.ts already wrote
 * with a raw-code buyer name (e.g. "073R96" instead of "SECRETARÍA DE
 * INFRAESTRUCTURA Y OBRA PÚBLICA (JAL)") — confirmed real 2026-09-03 for
 * a batch of Jalisco electromovilidad-L5 procedures the user spotted on
 * the homepage. See resolveBuyerName() in lib/ingestion/licitia-vigente-
 * mapper.ts and fetchLicitacionDetail() in
 * lib/ingestion/connectors/licitia-connector.ts for the fix itself — this
 * script only re-runs that same resolution against rows already in
 * Supabase, since discover-comprasmx-vigente.ts's own dedup (skip any
 * tender_number already present) means simply re-running it does NOT
 * revisit rows it already wrote.
 *
 * Deliberately re-checks EVERY row from this source, not just ones whose
 * stored buyer "looks like" a raw code — real gap found 2026-09-03: a
 * buyer stored as "ATTRAPI" (no digit) slipped past an earlier version of
 * this script that only checked `/\d/`, and there was no way to tell from
 * the stored value alone whether that's a real acronym or another kind of
 * bad data LicitIA's detail API returns for some buyers. Re-fetching
 * unconditionally and diffing against what's stored catches both known
 * and not-yet-seen bad shapes the same way, at the cost of one extra API
 * call per row for buyers that turn out fine already.
 *
 * Scoped to source_name = the LicitIA discovery source specifically —
 * other sources' buyer fields come from their own real columns (Compras
 * MX's "SIGLAS DEPENDENCIA O ENTIDAD", etc.) and were never at risk of
 * this bug.
 *
 * Usage:
 *   npm run fix:licitia-buyer-names               (dry run — report only)
 *   npm run fix:licitia-buyer-names -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchLicitacionDetail } from "../lib/ingestion/connectors/licitia-connector";
import { resolveBuyerName } from "../lib/ingestion/licitia-vigente-mapper";

const SOURCE_NAME = "LicitIA Abierto (espejo de ComprasMX/CompraNet Datos Abiertos)";

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data: rows, error } = await supabase.from("tenders").select("slug, tender_number, buyer").eq("source_name", SOURCE_NAME);
  if (error) {
    console.error(`Failed to query tenders: ${error.message}`);
    process.exit(1);
  }

  console.log(`${rows?.length ?? 0} tender(s) from this source — re-checking every one against the live detail API.\n`);

  let fixed = 0;
  let unchanged = 0;
  for (const row of rows ?? []) {
    const tenderNumber = row.tender_number as string;
    const slug = row.slug as string;
    const oldBuyer = row.buyer as string;

    const result = await fetchLicitacionDetail(tenderNumber);
    if (result.status !== "found") {
      console.log(`  [skip] ${slug} (${tenderNumber}) — detail lookup ${result.status}${result.status === "error" ? `: ${result.message}` : ""}`);
      continue;
    }

    const newBuyer = resolveBuyerName({ siglas: "", dependencia: "" } as never, result.detail) ?? oldBuyer;
    if (newBuyer === oldBuyer) {
      console.log(`  [same] ${slug} (${tenderNumber}) — still "${oldBuyer}" (no better name found)`);
      unchanged++;
      continue;
    }

    console.log(`  [fix]  ${slug} (${tenderNumber}) — "${oldBuyer}" -> "${newBuyer}"`);
    fixed++;
    if (shouldWrite) {
      const { error: updateError } = await supabase.from("tenders").update({ buyer: newBuyer }).eq("slug", slug);
      if (updateError) console.error(`    failed to write: ${updateError.message}`);
    }
  }

  console.log(`\n${fixed} fixable (${unchanged} left unchanged, no better name available).`);
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
