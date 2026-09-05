/**
 * One-off backfill for Colombia tenders ingested before colombia-mapper.ts's
 * inferStatus() fix (2026-09-05) — every row already in the database keeps
 * whatever status it was ingested with; this doesn't retroactively apply,
 * same reason fix-cfe-source-urls.ts was needed for CFE's sourceUrl change.
 *
 * The fix itself: a real named `awardedTo`/`nombre_del_proveedor` (already
 * stored as `awarded_to`) is now checked ahead of the often-lagging
 * `adjudicado` field — relevant mainly for "Contratación Directa" rows,
 * where `adjudicado` can stay "No" even once a real provider is on record
 * (see inferStatus()'s own comment in colombia-mapper.ts). This script
 * applies that same rule directly to already-stored rows: any Colombia
 * tender (slug prefix "secop-", colombia-mapper.ts's own namespace) with a
 * real `awarded_to` but a status other than "awarded" gets corrected.
 *
 * Usage:
 *   npm run fix:colombia-awarded-status               (dry run — report only)
 *   npm run fix:colombia-awarded-status -- --write     (writes to Supabase)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const PAGE_SIZE = 1000;
  // Collect every matching row FIRST, across all pages, before writing
  // anything — writing while paginating this same filtered query would
  // shrink the result set out from under `.range()` as rows flip to
  // "awarded" mid-loop (a later page's offset would then skip rows that
  // shifted down into an already-visited range).
  const toFix: { slug: string; status: string; awardedTo: string }[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: rows, error } = await supabase
      .from("tenders")
      .select("slug, status, awarded_to")
      .like("slug", "secop-%")
      .not("awarded_to", "is", null)
      .neq("status", "awarded")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Failed to query tenders: ${error.message}`);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      toFix.push({ slug: row.slug as string, status: row.status as string, awardedTo: row.awarded_to as string });
    }

    if (rows.length < PAGE_SIZE) break;
  }

  for (const { slug, status, awardedTo } of toFix) {
    console.log(`  [fix] ${slug} — status "${status}" -> "awarded" (awarded_to: "${awardedTo}")`);
    if (shouldWrite) {
      const { error: updateError } = await supabase.from("tenders").update({ status: "awarded" }).eq("slug", slug);
      if (updateError) console.error(`    failed to write ${slug}: ${updateError.message}`);
    }
  }

  console.log(`\n${toFix.length} fixed.`);
  if (!shouldWrite) console.log("dry run (pass --write to update Supabase) — nothing was written.");
}

main();
