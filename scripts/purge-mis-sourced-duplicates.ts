/**
 * Removes the duplicate rows left behind when a Proyectos Estratégicos export
 * was imported under the "Compras MX — 开放招标" option by mistake
 * (user, 2026-09-12: 我之前导入时选错了数据来源).
 *
 * The two sources deliberately use different slug namespaces, so the same
 * procedure imported under the wrong one does NOT update the existing row —
 * it creates a second one. 26 pairs were found in production, each an FP-
 * number sitting under both `comprasmx-` and `proyectosestrategicos-`, with
 * identical titles.
 *
 * The `comprasmx-` twin is the one deleted. It is the mistaken import, and the
 * `proyectosestrategicos-` row is the correct one in two ways that matter: its
 * source_name is what classifyStoredTender() reads to mark these as
 * national-priority projects, and in the observed data it is the row carrying
 * the Chinese title.
 *
 * Deletes ONLY a row that has a confirmed twin — same tender_number, the other
 * prefix, both present. A lone comprasmx-FP row is left alone and reported,
 * since that would mean the pairing assumption does not hold and a human
 * should look before anything is destroyed.
 *
 * Goes through the same tender_manual_deletions block list the admin UI uses,
 * so a later re-import of the same bad file cannot silently bring them back —
 * and import-new-tenders now refuses that file outright anyway.
 *
 * Usage:
 *   npm run purge:mis-sourced          (report only)
 *   npm run purge:mis-sourced -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type Row = { id: string; slug: string; tender_number: string; title: { zh?: string; es?: string } | null };

async function main() {
  const write = process.argv.slice(2).includes("--write");
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("tenders").select("id, slug, tender_number, title").range(from, from + 999);
    if (error) throw new Error(`Failed to read tenders: ${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const byNumber = new Map<string, Row[]>();
  for (const row of rows) {
    const key = (row.tender_number ?? "").trim().toUpperCase();
    if (!key) continue;
    const list = byNumber.get(key);
    if (list) list.push(row);
    else byNumber.set(key, [row]);
  }

  const toDelete: Row[] = [];
  const unpaired: Row[] = [];
  for (const [, list] of byNumber) {
    const wrong = list.filter((r) => r.slug.startsWith("comprasmx-fp-"));
    const right = list.filter((r) => r.slug.startsWith("proyectosestrategicos-"));
    if (wrong.length === 0) continue;
    if (right.length === 0) unpaired.push(...wrong);
    else toDelete.push(...wrong);
  }

  console.log(`${rows.length} 条项目，找到 ${toDelete.length} 条「选错来源」产生的重复行。\n`);
  for (const row of toDelete) {
    console.log(`  删除  ${row.slug}`);
    console.log(`        ${(row.title?.zh || row.title?.es || "").slice(0, 88)}`);
  }
  if (unpaired.length > 0) {
    console.log(`\n另有 ${unpaired.length} 条 comprasmx-fp-* 没有对应的 proyectosestrategicos- 双胞胎——没有删，请先人工看一眼：`);
    for (const row of unpaired) console.log(`  ${row.slug}`);
  }

  if (!write) {
    console.log(`\n试运行（加 --write 才真的删除）——什么都没动。`);
    return;
  }
  if (toDelete.length === 0) return;

  // The block list first: if the delete succeeds and this does not, a later
  // re-import could put them back. The other order cannot lose anything.
  const { error: blockError } = await supabase.from("tender_manual_deletions").upsert(
    toDelete.map((row) => ({ slug: row.slug, tender_number: row.tender_number, title: row.title?.es ?? row.title?.zh ?? null })),
    { onConflict: "slug" },
  );
  if (blockError) throw new Error(`Failed to record the deletions: ${blockError.message}`);

  const { error: deleteError } = await supabase.from("tenders").delete().in("id", toDelete.map((r) => r.id));
  if (deleteError) throw new Error(`Failed to delete: ${deleteError.message}`);

  console.log(`\n已删除 ${toDelete.length} 条，并记入黑名单以免再次导入时复活。`);
}

main();
