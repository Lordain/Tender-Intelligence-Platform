/**
 * Cleans up the duplicate Colombian rows that SECOP II's phase labels
 * created before colombia-mapper.ts started stripping them.
 *
 * The same procurement was published twice, differing only by a suffix on
 * the reference — "JBB-LP-004-2026" and "JBB-LP-004-2026 (Presentación de
 * oferta)" — and since the slug is built from the reference, each pair became
 * two tenders with the same buyer, description and amount.
 *
 * The mapper fix stops new ones appearing; it cannot touch what is already
 * stored, because the clean slug is a different row from the suffixed one.
 * So:
 *
 *   - suffixed row WITH a clean twin  -> delete the suffixed row
 *   - suffixed row with NO clean twin -> rename it to the clean slug and
 *     reference, since deleting would lose a tender that has no other copy
 *
 * Manually edited rows are never touched: an admin who fixed one of the pair
 * by hand should be asked which to keep, not have the answer chosen here.
 *
 * Usage:
 *   npm run dedupe:secop-phases                (dry run — prints the plan)
 *   npm run dedupe:secop-phases -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { stripProcessPhaseSuffix } from "../lib/ingestion/colombia-mapper";
import { slugify } from "../lib/ingestion/text-utils";

type Row = {
  slug: string;
  tender_number: string;
  title: { es?: string } | null;
  manual_field_overrides: string[] | null;
};

async function main() {
  const shouldWrite = process.argv.includes("--write");
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, manual_field_overrides")
      .eq("country", "Colombia")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`读取失败：${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }

  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const toDelete: Row[] = [];
  const toRename: { row: Row; slug: string; tenderNumber: string }[] = [];
  const skipped: Row[] = [];

  for (const row of rows) {
    const cleanNumber = stripProcessPhaseSuffix(row.tender_number ?? "");
    if (!cleanNumber || cleanNumber === row.tender_number) continue;
    const cleanSlug = `secop-${slugify(cleanNumber)}`;
    if (cleanSlug === row.slug) continue;

    if ((row.manual_field_overrides ?? []).length > 0) {
      skipped.push(row);
      continue;
    }
    if (bySlug.has(cleanSlug)) toDelete.push(row);
    else toRename.push({ row, slug: cleanSlug, tenderNumber: cleanNumber });
  }

  console.log(`哥伦比亚共 ${rows.length} 条。`);
  console.log(`  重复（有干净副本）可删除：${toDelete.length}`);
  for (const row of toDelete.slice(0, 20)) console.log(`    - ${row.slug}`);
  if (toDelete.length > 20) console.log(`    …… 还有 ${toDelete.length - 20} 条`);
  console.log(`  只有带后缀的一份，改名保留：${toRename.length}`);
  for (const item of toRename.slice(0, 20)) console.log(`    ~ ${item.row.slug} -> ${item.slug}`);
  if (toRename.length > 20) console.log(`    …… 还有 ${toRename.length - 20} 条`);
  if (skipped.length > 0) {
    console.log(`  有手动编辑、跳过不动：${skipped.length}`);
    for (const row of skipped) console.log(`    ! ${row.slug}（${row.title?.es ?? ""}）`);
    console.log("    这些请在后台自己决定保留哪一条。");
  }

  if (!shouldWrite) {
    console.log("\n空跑：加 --write 才会真正删除/改名。");
    return;
  }

  let deleted = 0;
  for (const row of toDelete) {
    const { error } = await supabase.from("tenders").delete().eq("slug", row.slug);
    if (error) console.error(`删除失败 ${row.slug}：${error.message}`);
    else deleted += 1;
  }
  let renamed = 0;
  for (const item of toRename) {
    const { error } = await supabase
      .from("tenders")
      .update({ slug: item.slug, tender_number: item.tenderNumber, updated_at: new Date().toISOString() })
      .eq("slug", item.row.slug);
    if (error) console.error(`改名失败 ${item.row.slug}：${error.message}`);
    else renamed += 1;
  }
  console.log(`\n已删除 ${deleted} 条，改名 ${renamed} 条。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
