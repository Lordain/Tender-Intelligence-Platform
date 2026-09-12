/**
 * One-off repair for CFE tenders written before the CFE-micrositio
 * sourceUrl change (see CFE_BUYER_PATTERN/CFE_MICROSITIO_URL in
 * lib/ingestion/heuristics.ts) — every CFE row ingested from DOF before
 * that change still has the old `dof.gob.mx/nota_detalle.php` link.
 * Confirmed real 2026-09-05: the user opened an already-ingested CFE
 * tender's edit form and its 来源链接 still showed the old DOF URL, since
 * re-ingesting requires the same originally-captured source file this
 * sandbox can't re-fetch — this script updates the stored rows directly
 * instead, same approach as fix-pemex-source-urls.ts.
 *
 * Scoped to rows from either DOF mapper's own source_name (dof-mapper.ts's
 * "Diario Oficial de la Federación (DOF)" and dof-search-mapper.ts's
 * "... — búsqueda avanzada") — deliberately NOT every row with a CFE-like
 * buyer, since other sources (e.g. Proyectos Estratégicos MX) can also
 * carry CFE as a buyer and should keep their own real sourceUrl untouched.
 *
 * Usage:
 *   npm run fix:cfe-source-urls               (dry run — report only)
 *   npm run fix:cfe-source-urls -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { CFE_BUYER_PATTERN, CFE_MICROSITIO_URL } from "../lib/ingestion/heuristics";

const DOF_SOURCE_NAMES = ["Diario Oficial de la Federación (DOF)", "Diario Oficial de la Federación (DOF) — búsqueda avanzada"];

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const PAGE_SIZE = 1000;
  let fixed = 0;
  let notCfe = 0;
  let alreadyRight = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: rows, error } = await supabase
      .from("tenders")
      .select("slug, buyer, source_url")
      .in("source_name", DOF_SOURCE_NAMES)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Failed to query tenders: ${error.message}`);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const slug = row.slug as string;
      const buyer = row.buyer as string;
      const oldSourceUrl = row.source_url as string;

      if (!CFE_BUYER_PATTERN.test(buyer)) {
        notCfe++;
        continue;
      }
      if (oldSourceUrl === CFE_MICROSITIO_URL) {
        alreadyRight++;
        continue;
      }

      fixed++;
      console.log(`  [fix] ${slug} — "${oldSourceUrl}" -> "${CFE_MICROSITIO_URL}"`);
      if (shouldWrite) {
        const { error: updateError } = await supabase.from("tenders").update({ source_url: CFE_MICROSITIO_URL }).eq("slug", slug);
        if (updateError) console.error(`    failed to write ${slug}: ${updateError.message}`);
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`\n${fixed} fixed, ${alreadyRight} already correct, ${notCfe} skipped (not a CFE buyer).`);
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
