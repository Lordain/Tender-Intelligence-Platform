/**
 * Re-keys every stored Colombian tender — and the deletion block list —
 * onto the entity-qualified slug scheme (buildSecopSlug in
 * lib/ingestion/colombia-mapper.ts).
 *
 * WHY THIS EXISTS
 *
 * The old slug was `secop-${slugify(referencia_del_proceso)}`, and a
 * Colombian process reference is an ENTITY-LOCAL sequence: every
 * municipality, school and ministry issues its own LP-001-2026,
 * LP-002-2026, LP-003-2026. Unrelated procurements therefore shared one
 * slug, and since the import upserts by slug, the second one written
 * silently destroyed the first. The same bug poisoned this table: an admin
 * deleting one municipality's contract permanently blocked another
 * municipality's unrelated project from ever being imported.
 *
 * The mapper now emits `secop-<nit_entidad>-<referencia>`. Stored rows are
 * still on the old key, so without this script the next import treats every
 * Colombian tender as brand new: it inserts a second copy under the new
 * slug, leaves the old row orphaned (and still in the feed), and every
 * manual edit, analysis, key date and document attached to the old row stays
 * attached to the orphan.
 *
 * HOW A ROW IS RESOLVED
 *
 * The new slug can't be computed from the stored row alone — nothing in
 * `tenders` carries the entity's NIT. So each stored tender_number is
 * looked up at the source, and the right process is picked out of the group
 * that reference returns:
 *
 *   - tenders    → matched on the BUYER (entidad), which the row stores.
 *   - deletions  → matched on the TITLE, which is all the tombstone kept
 *                  (tender_manual_deletions stores title.es at delete time,
 *                  so it is the mapper's own Spanish title and compares
 *                  exactly against a freshly mapped candidate).
 *
 * Anything that does not resolve to exactly one candidate is REPORTED AND
 * LEFT ALONE — never guessed. A wrong re-key is worse than an unmigrated
 * row: it would hand one entity's tender the identity of another's, which
 * is the very bug being fixed.
 *
 * Two rows resolving to the SAME new slug is not an error — it is the
 * phase-variant duplicate ("JBB-LP-004-2026" and "JBB-LP-004-2026
 * (Presentación de oferta)") collapsing as designed. The script keeps the
 * one an admin has edited, else the older row, and reports the other rather
 * than deleting it: merging two rows' children is a judgement call, not a
 * migration.
 *
 * Idempotent — a row already on the new scheme is skipped, so re-running
 * after fixing the reported cases is safe.
 *
 * Usage:
 *   npm run migrate:colombia-slugs                (dry run — prints the plan)
 *   npm run migrate:colombia-slugs -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchSecopProcesosByReference } from "../lib/ingestion/connectors/colombia-secop-live";
import { buildSecopSlug, stripProcessPhaseSuffix, mapSecopRowToTender, type SecopProcesoRow } from "../lib/ingestion/colombia-mapper";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";
const PAGE = 1000;

type TenderRow = {
  slug: string;
  tender_number: string;
  buyer: string;
  title: { es?: string; zh?: string } | null;
  publication_date: string | null;
  manual_field_overrides: string[] | null;
};

type DeletionRow = { slug: string; tender_number: string | null; title: string | null };

type Candidate = { newSlug: string; reference: string; buyer: string; titleEs: string };

/** Accent- and case-insensitive, whitespace-collapsed — entity names vary in casing and accents between rows. */
function norm(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function refKey(value: string | null | undefined): string {
  return norm(stripProcessPhaseSuffix(value ?? ""));
}

type PagedResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

async function readAll<T>(build: (from: number, to: number) => PagedResult, label: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`读取 ${label} 失败：${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

async function main() {
  const shouldWrite = process.argv.includes("--write");
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const tenders = await readAll<TenderRow>(
    (from, to) =>
      supabase
        .from("tenders")
        .select("slug, tender_number, buyer, title, publication_date, manual_field_overrides")
        .like("slug", "secop-%")
        .range(from, to),
    "tenders",
  );
  const deletions = await readAll<DeletionRow>(
    (from, to) => supabase.from("tender_manual_deletions").select("slug, tender_number, title").like("slug", "secop-%").range(from, to),
    "tender_manual_deletions",
  );

  console.log(`库里 ${tenders.length} 条哥伦比亚项目，黑名单 ${deletions.length} 条。`);

  const references = [
    ...tenders.map((t) => t.tender_number),
    ...deletions.map((d) => d.tender_number ?? ""),
  ].filter((r) => r.trim().length > 0);

  if (references.length === 0) {
    console.log("没有可迁移的行。");
    return;
  }

  console.log(`正在向 SECOP 回查 ${new Set(references).size} 个不同的过程编号……`);
  const sourceRows = await fetchSecopProcesosByReference([...new Set(references)]);
  console.log(`源头返回 ${sourceRows.length} 行。\n`);

  // Group every source row by its phase-stripped reference, which is the
  // only thing a stored row and a source row are guaranteed to share.
  const byReference = new Map<string, Candidate[]>();
  for (const row of sourceRows as SecopProcesoRow[]) {
    const reference = stripProcessPhaseSuffix(row.referencia_del_proceso?.trim() || row.id_del_proceso?.trim() || "");
    if (!reference) continue;
    const mapped = mapSecopRowToTender(row, SOURCE_NAME);
    const candidate: Candidate = {
      // Fall back to the raw fields when the mapper rejects the row (a
      // modalidad this platform no longer ingests, say): the point here is
      // the row's IDENTITY, and that is well-defined either way.
      newSlug: mapped?.slug ?? buildSecopSlug(row, reference),
      reference,
      buyer: mapped?.buyer ?? row.entidad?.trim() ?? "",
      titleEs: mapped?.title.es ?? row.nombre_del_procedimiento?.trim() ?? "",
    };
    const key = norm(reference);
    const list = byReference.get(key) ?? [];
    // The same process can come back more than once across batches; one identity per slug.
    if (!list.some((c) => c.newSlug === candidate.newSlug)) list.push(candidate);
    byReference.set(key, list);
  }

  const renames: { from: string; to: string; label: string }[] = [];
  const unresolved: { slug: string; reason: string }[] = [];
  const collapses: { keep: string; drop: string; to: string; label: string }[] = [];
  const claimed = new Map<string, TenderRow>();

  const alreadyNewScheme = new Set(tenders.map((t) => t.slug));

  for (const tender of tenders) {
    const group = byReference.get(refKey(tender.tender_number)) ?? [];
    if (group.length === 0) {
      unresolved.push({ slug: tender.slug, reason: `源头查不到这个编号（${tender.tender_number}）` });
      continue;
    }
    const matches = group.length === 1 ? group : group.filter((c) => norm(c.buyer) === norm(tender.buyer));
    if (matches.length === 0) {
      unresolved.push({ slug: tender.slug, reason: `编号对上 ${group.length} 个单位，但都不是「${tender.buyer}」` });
      continue;
    }
    if (matches.length > 1) {
      unresolved.push({ slug: tender.slug, reason: `同一个单位下有 ${matches.length} 个同编号过程，无法判断` });
      continue;
    }
    const target = matches[0].newSlug;
    if (target === tender.slug) continue; // already migrated

    const other = claimed.get(target);
    if (other) {
      // Two stored rows are one tender (the phase-variant duplicate). Keep
      // the edited one, else the older one.
      const otherEdited = (other.manual_field_overrides ?? []).length > 0;
      const thisEdited = (tender.manual_field_overrides ?? []).length > 0;
      const keepOther =
        otherEdited !== thisEdited ? otherEdited : (other.publication_date ?? "") <= (tender.publication_date ?? "");
      const keep = keepOther ? other : tender;
      const drop = keepOther ? tender : other;
      collapses.push({ keep: keep.slug, drop: drop.slug, to: target, label: keep.title?.es ?? keep.tender_number });
      claimed.set(target, keep);
      continue;
    }
    if (alreadyNewScheme.has(target)) {
      unresolved.push({ slug: tender.slug, reason: `目标 slug ${target} 已被另一条占用` });
      continue;
    }
    claimed.set(target, tender);
    renames.push({ from: tender.slug, to: target, label: (tender.title?.es ?? tender.tender_number).slice(0, 78) });
  }

  // Re-keep only the survivor of each collapse.
  const collapsedKeeps = new Map(collapses.map((c) => [c.keep, c.to]));
  for (const [slug, to] of collapsedKeeps) {
    if (!renames.some((r) => r.from === slug) && slug !== to) {
      const row = tenders.find((t) => t.slug === slug)!;
      renames.push({ from: slug, to, label: (row.title?.es ?? row.tender_number).slice(0, 78) });
    }
  }

  // ---- deletion block list ----
  const deletionRenames: { from: string; to: string; label: string }[] = [];
  const deletionUnresolved: { slug: string; reason: string }[] = [];
  const takenDeletionSlugs = new Set(deletions.map((d) => d.slug));

  for (const deletion of deletions) {
    if (!deletion.tender_number) {
      deletionUnresolved.push({ slug: deletion.slug, reason: "这条记录没有存招标编号，无法回查" });
      continue;
    }
    const group = byReference.get(refKey(deletion.tender_number)) ?? [];
    if (group.length === 0) {
      deletionUnresolved.push({ slug: deletion.slug, reason: `源头查不到这个编号（${deletion.tender_number}）` });
      continue;
    }
    const matches = group.length === 1 ? group : group.filter((c) => norm(c.titleEs) === norm(deletion.title));
    if (matches.length !== 1) {
      deletionUnresolved.push({
        slug: deletion.slug,
        reason:
          matches.length === 0
            ? `编号对上 ${group.length} 个单位，但标题都对不上——不敢猜是哪一个`
            : `${matches.length} 个候选标题都一样，无法判断`,
      });
      continue;
    }
    const target = matches[0].newSlug;
    if (target === deletion.slug) continue;
    if (takenDeletionSlugs.has(target)) continue; // already tombstoned under the new key
    deletionRenames.push({ from: deletion.slug, to: target, label: (deletion.title ?? deletion.tender_number).slice(0, 78) });
    takenDeletionSlugs.add(target);
  }

  // ---- report ----
  console.log(`【项目】${renames.length} 条要改 slug，${collapses.length} 条是同一个标的重复行，${unresolved.length} 条无法解析。`);
  for (const r of renames.slice(0, 20)) console.log(`  ${r.from}\n    → ${r.to}    ${r.label}`);
  if (renames.length > 20) console.log(`  ……另外 ${renames.length - 20} 条。`);

  if (collapses.length > 0) {
    console.log(`\n【重复行】下面每一对其实是同一个标（交标阶段副本），迁移后会指向同一个 slug。保留的那条会改名，另一条没有动，请人工确认后再删：`);
    for (const c of collapses) console.log(`  保留 ${c.keep}\n  留待人工处理 ${c.drop}\n    → ${c.to}    ${c.label}`);
  }

  if (unresolved.length > 0) {
    console.log(`\n【无法解析，全部原样保留】`);
    for (const u of unresolved) console.log(`  ${u.slug}\n    ${u.reason}`);
  }

  console.log(`\n【黑名单】${deletionRenames.length} 条要改 slug，${deletionUnresolved.length} 条无法解析。`);
  for (const r of deletionRenames.slice(0, 20)) console.log(`  ${r.from}\n    → ${r.to}    ${r.label}`);
  if (deletionRenames.length > 20) console.log(`  ……另外 ${deletionRenames.length - 20} 条。`);
  if (deletionUnresolved.length > 0) {
    console.log(`\n  无法解析的黑名单记录（原样保留；它们挡不住新 slug 了，对应项目可能会在下次导入时回来，届时再删一次即可）：`);
    for (const u of deletionUnresolved.slice(0, 30)) console.log(`    ${u.slug} —— ${u.reason}`);
    if (deletionUnresolved.length > 30) console.log(`    ……另外 ${deletionUnresolved.length - 30} 条。`);
  }

  if (!shouldWrite) {
    console.log(`\n试运行（加 --write 才真的改写）——什么都没动。`);
    return;
  }

  let tenderOk = 0;
  for (const r of renames) {
    const { error } = await supabase.from("tenders").update({ slug: r.to }).eq("slug", r.from);
    if (error) {
      console.error(`  改名失败 ${r.from} → ${r.to}：${error.message}`);
      continue;
    }
    tenderOk += 1;
  }

  let deletionOk = 0;
  for (const r of deletionRenames) {
    const { data: existing } = await supabase
      .from("tender_manual_deletions")
      .select("tender_number, title, deleted_at")
      .eq("slug", r.from)
      .maybeSingle();
    const { error: insertError } = await supabase
      .from("tender_manual_deletions")
      .upsert({ slug: r.to, ...(existing ?? {}) }, { onConflict: "slug" });
    if (insertError) {
      console.error(`  黑名单改名失败 ${r.from} → ${r.to}：${insertError.message}`);
      continue;
    }
    // Only after the new key is safely in place — a crash between the two
    // leaves the tender blocked twice, never unblocked.
    const { error: deleteError } = await supabase.from("tender_manual_deletions").delete().eq("slug", r.from);
    if (deleteError) console.error(`  旧黑名单记录未能删除 ${r.from}：${deleteError.message}（新记录已写入，不影响拦截）`);
    deletionOk += 1;
  }

  console.log(`\n已改写 ${tenderOk}/${renames.length} 条项目、${deletionOk}/${deletionRenames.length} 条黑名单记录。`);
  console.log(`别忘了跑一次 npm run check:duplicate-ids 确认没有新的撞号。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
