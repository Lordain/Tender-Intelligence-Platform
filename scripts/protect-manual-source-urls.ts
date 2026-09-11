/**
 * Reports which tenders' `source_url` is hand-entered rather than produced by
 * an importer, and locks those against being overwritten by the next import.
 *
 * Why this exists (2026-09-11): the user filled in real per-procedure links
 * for the Proyectos Estratégicos MX rows by hand. upsert-tenders.ts already
 * protects hand-edited columns — but only ones recorded in
 * `manual_field_overrides`, which the admin edit API fills in as it diffs a
 * save. A row edited straight in Supabase's table editor carries no such
 * record, so the next import would put the generic site URL back over it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, learned from its own first dry run:
 * "the URL is not the generic fallback" is NOT the same as "a human typed
 * it". That first version proposed locking 243 rows, and essentially all of
 * them were machine-produced — SECOP II's real `urlproceso.url` deep links
 * (138), Compras MX links already resolved through LicitIA by
 * resolve-comprasmx-links.ts (96), PEMEX's per-list search pages, the DOF
 * row's CFE microsite. Locking those would have frozen exactly the links the
 * importers are supposed to keep fresh, which is the opposite of the point.
 *
 * So a source is only judged here when its mapper writes a CONSTANT
 * sourceUrl — because only then is "different from that constant" evidence
 * of a human. Sources whose mapper derives a per-row URL from the source data
 * (SECOP II, Compras MX contracts, PEMEX, DOF, Peru OxI) cannot be judged
 * this way and are reported separately, never locked.
 *
 * Usage:
 *   npm run protect:source-urls                          (report only)
 *   npm run protect:source-urls -- --write
 *   npm run protect:source-urls -- --source "Proyectos"  (substring filter)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { NATIONAL_PRIORITY_SOURCE_NAME } from "../lib/relevance";

/**
 * source_name -> the single URL that source's mapper writes for every row.
 *
 * Compras MX open-tenders is deliberately ABSENT even though its mapper does
 * write a constant: resolve-comprasmx-links.ts legitimately replaces that
 * constant with a resolved deep link, so a differing value there is the
 * machine's work, not a human's.
 */
const CONSTANT_URL_SOURCES: Record<string, string> = {
  [NATIONAL_PRIORITY_SOURCE_NAME]: "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/",
};

type Row = { slug: string; source_name: string | null; source_url: string | null; manual_field_overrides: string[] | null };

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const sourceFilterIdx = args.indexOf("--source");
  const sourceFilter = sourceFilterIdx >= 0 ? args[sourceFilterIdx + 1] : undefined;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const { data, error } = await supabase.from("tenders").select("slug, source_name, source_url, manual_field_overrides");
  if (error) {
    console.error(`Failed to query tenders: ${error.message}`);
    process.exit(1);
  }
  const rows = ((data ?? []) as Row[]).filter(
    (row) => !sourceFilter || (row.source_name ?? "").toLowerCase().includes(sourceFilter.toLowerCase()),
  );

  const isProtected = (row: Row) => (row.manual_field_overrides ?? []).includes("source_url");

  console.log("判定得了的来源（mapper 写的是固定 URL，不一样就是人改的）：\n");
  const candidates: Row[] = [];
  for (const [sourceName, constantUrl] of Object.entries(CONSTANT_URL_SOURCES)) {
    const ofSource = rows.filter((row) => row.source_name === sourceName);
    if (ofSource.length === 0) continue;
    const onConstant = ofSource.filter((row) => (row.source_url ?? "") === constantUrl);
    const differs = ofSource.filter((row) => (row.source_url ?? "") !== constantUrl);
    const alreadySafe = differs.filter(isProtected);
    const needsLock = differs.filter((row) => !isProtected(row));
    candidates.push(...needsLock);

    console.log(`  ${sourceName}  共 ${ofSource.length} 条`);
    console.log(`    ${String(onConstant.length).padStart(4)} 条仍是导入器的固定 URL（没人改过）`);
    console.log(`    ${String(alreadySafe.length).padStart(4)} 条是人改的，且已受保护 ✅`);
    console.log(`    ${String(needsLock.length).padStart(4)} 条是人改的，但未受保护 ⚠️`);
    for (const row of needsLock.slice(0, 5)) console.log(`           ${row.slug} -> ${row.source_url}`);
    console.log();
  }

  const unjudgeable = rows.filter((row) => !(row.source_name ?? "") || !(row.source_name! in CONSTANT_URL_SOURCES));
  const bySource = new Map<string, number>();
  for (const row of unjudgeable) bySource.set(row.source_name ?? "(无)", (bySource.get(row.source_name ?? "(无)") ?? 0) + 1);
  console.log("判定不了的来源（mapper 按行生成 URL，改没改看不出来，一律不锁）：");
  for (const [name, count] of [...bySource].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${name}`);
  }

  if (candidates.length === 0) {
    console.log("\n没有需要加锁的行。");
    return;
  }
  if (!write) {
    console.log(`\n${candidates.length} 条待加锁 — dry run（加 --write 实际写入 manual_field_overrides）。`);
    return;
  }

  let updated = 0;
  for (const row of candidates) {
    const overrides = [...new Set([...(row.manual_field_overrides ?? []), "source_url"])].sort();
    const { error: updateError } = await supabase.from("tenders").update({ manual_field_overrides: overrides }).eq("slug", row.slug);
    if (updateError) {
      console.error(`  ${row.slug}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }
  console.log(`\n已保护 ${updated} / ${candidates.length} 条。`);
}

main();
