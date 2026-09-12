/**
 * Finds tenders that share an identifier when they are not the same tender.
 *
 * Two checks, because the damage happens in two different places.
 *
 * 1. SUPABASE — one tender_number used by more than one row. The 招标编号 is
 *    what an admin searches by and what a customer quotes back, so the same
 *    number on two unrelated projects is wrong on its own.
 *
 * 2. THE SOURCE — more than one live SECOP II procurement mapping to ONE slug.
 *    This is the dangerous one, and it is silent. Colombia's slug is
 *    `secop-${slugify(referencia_del_proceso)}` (colombia-mapper.ts), and a
 *    Colombian process reference is an ENTITY-LOCAL sequence: every
 *    municipality issues its own LP-001-2026, LP-002-2026, LP-003-2026. Two
 *    unrelated projects therefore collide on one slug, and because the import
 *    upserts by slug, the second one written silently overwrites the first.
 *
 *    Four collisions were visible in a single screen of the user's own output
 *    on 2026-09-12 — secop-lp-002-2026, -003-, -005- and -006- each carrying
 *    two completely different titles. It also corrupts the manual-deletion
 *    block list, which is keyed by slug: deleting one municipality's security
 *    contract permanently blocks another municipality's hospital.
 *
 * Read-only. The row carries nit_entidad, codigo_entidad and a globally unique
 * id_del_proceso (CO1.REQ.10977929) — any of which would make the slug unique —
 * but changing the scheme changes every existing row's identity, so this
 * script only measures. Fix is a separate decision.
 *
 * Usage:
 *   npm run check:duplicate-ids
 *   npm run check:duplicate-ids -- --days 60
 */
import { fetchSecopProcesos } from "../lib/ingestion/connectors/colombia-secop-live";
import { mapSecopRowToTender, isIngestedColombiaModalidad } from "../lib/ingestion/colombia-mapper";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";
const PAGE = 1000;

async function checkSupabase() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured for this shell — skipping the database check.\n");
    return;
  }
  const rows: { slug: string; tender_number: string; title: { zh?: string; es?: string } | null; source_name: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("tenders").select("slug, tender_number, title, source_name").range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read tenders: ${error.message}`);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const bySlugCount = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = (row.tender_number ?? "").trim().toUpperCase();
    if (!key) continue;
    const list = bySlugCount.get(key);
    if (list) list.push(row);
    else bySlugCount.set(key, [row]);
  }
  const dupes = [...bySlugCount.entries()].filter(([, list]) => list.length > 1);

  console.log(`【库里】${rows.length} 条项目，${dupes.length} 个招标编号被不止一条项目占用。`);
  for (const [number, list] of dupes.slice(0, 30)) {
    console.log(`\n  ${number}  (${list.length} 条)`);
    for (const row of list) console.log(`    ${row.slug}\n      ${(row.title?.zh || row.title?.es || "").slice(0, 88)}`);
  }
  if (dupes.length > 30) console.log(`\n  …还有 ${dupes.length - 30} 组。`);
  console.log();
}

async function checkColombiaSource(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`【源头】拉取 datos.gov.co ${since.toISOString().slice(0, 10)} 之后发布的招标...`);
  const rows = await fetchSecopProcesos({ sinceDate: since });

  const bySlug = new Map<string, { entity: string; title: string; reference: string; processId: string }[]>();
  for (const row of rows) {
    if (!isIngestedColombiaModalidad(row.modalidad_de_contratacion)) continue;
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    if (!tender) continue;
    const entry = {
      entity: row.entidad?.trim() ?? "(no entity)",
      title: tender.title.es,
      reference: row.referencia_del_proceso?.trim() ?? "",
      processId: row.id_del_proceso?.trim() ?? "",
    };
    const list = bySlug.get(tender.slug);
    if (list) list.push(entry);
    else bySlug.set(tender.slug, [entry]);
  }

  // Two rows are only a real collision when they are different PROCESSES.
  // SECOP II genuinely republishes one procurement under phase labels, which
  // colombia-mapper deliberately collapses onto one slug — that is intended
  // and must not be reported here.
  const collisions = [...bySlug.entries()].filter(([, list]) => new Set(list.map((e) => e.processId || e.title)).size > 1);

  console.log(`共 ${rows.length} 条，映射后 ${bySlug.size} 个不同的 slug，其中 ${collisions.length} 个 slug 被不止一个真实项目占用。\n`);
  for (const [slug, list] of collisions.slice(0, 25)) {
    console.log(`  ${slug}   ← ${list.length} 个不同项目挤在这一个 ID 上`);
    for (const entry of list) {
      console.log(`     ${entry.entity.slice(0, 46).padEnd(46)} ${entry.processId.padEnd(20)} ${entry.title.slice(0, 60)}`);
    }
    console.log();
  }
  if (collisions.length > 25) console.log(`  …还有 ${collisions.length - 25} 组。\n`);

  if (collisions.length > 0) {
    const lost = collisions.reduce((sum, [, list]) => sum + list.length - 1, 0);
    console.log(
      `结论：这 ${days} 天里，至少有 ${lost} 条项目在导入时会被同 slug 的另一条覆盖掉，而且不会有任何报错。\n` +
        `原因：slug = secop-<referencia_del_proceso>，而哥伦比亚的过程编号是「每个采购单位自己从 001 开始编」的。\n` +
        `每一行右边那个 CO1.REQ.xxx（id_del_proceso）是全局唯一的，可以用来修。`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--days");
  const days = Math.max(1, Number(idx >= 0 ? args[idx + 1] : 30) || 30);
  await checkSupabase();
  await checkColombiaSource(days);
}

main();
