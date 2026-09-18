/**
 * Finds tenders that share an identifier when they are not the same tender.
 *
 * Two checks, because the damage happens in two different places.
 *
 * 1. SUPABASE — one tender_number used by more than one row. This is NOT a
 *    defect to be fixed, and the first version of this comment said it was.
 *    A Colombian `referencia_del_proceso` is issued per entity: LP-006-2026
 *    belongs to Samacá and to Ayapel at the same time, and neither is
 *    wrong. What it is, is a hazard — anything that looks a tender up BY
 *    NUMBER has to cope with getting two. The one thing that did not was
 *    lib/ingestion/match-documents-to-tenders.ts, which filed a downloaded
 *    document against whichever of the two Supabase happened to return
 *    first (fixed 2026-09-18; it now resolves on the buyer's name in the
 *    document, or abstains). So this section is a WATCH LIST, not a defect
 *    count: a number appearing here means a document for it needs its file
 *    named `<slug>__…` to be certain where it lands.
 *
 * 2. THE SOURCE — more than one live SECOP II procurement mapping to ONE slug.
 *    This is the dangerous one, and it was silent. Colombia's slug USED TO BE
 *    `secop-${slugify(referencia_del_proceso)}` (colombia-mapper.ts), and a
 *    Colombian process reference is an ENTITY-LOCAL sequence: every
 *    municipality issues its own LP-001-2026, LP-002-2026, LP-003-2026. Two
 *    unrelated projects therefore collided on one slug, and because the import
 *    upserts by slug, the second one written silently overwrote the first.
 *    Fixed 2026-09-12 — the slug is entity-qualified now (buildSecopSlug),
 *    and stored rows were re-keyed by scripts/migrate-colombia-slugs.ts. This
 *    check stays as the regression test: it should now report zero.
 *
 *    Four collisions were visible in a single screen of the user's own output
 *    on 2026-09-12 — secop-lp-002-2026, -003-, -005- and -006- each carrying
 *    two completely different titles. It also corrupts the manual-deletion
 *    block list, which is keyed by slug: deleting one municipality's security
 *    contract permanently blocks another municipality's hospital.
 *
 * Read-only — it only measures. The fix lives in colombia-mapper.ts
 * (buildSecopSlug) and scripts/migrate-colombia-slugs.ts.
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

  console.log(
    `【库里】${rows.length} 条项目，${dupes.length} 个招标编号被不止一条项目占用。\n` +
      `这不是错误——哥伦比亚的编号是各单位自己发的，LP-006-2026 同时属于萨马卡和阿亚佩尔很正常。\n` +
      `它的意义是：给下面这些编号做标书分析时，文件名要写成「<项目slug>__原文件名」，否则只能靠文件里出现的采购单位名称来定位。`,
  );
  for (const [number, list] of dupes.slice(0, 30)) {
    console.log(`\n  ${number}  (${list.length} 条)`);
    for (const row of list) console.log(`    ${row.slug}\n      ${(row.title?.zh || row.title?.es || "").slice(0, 88)}`);
  }
  if (dupes.length > 30) console.log(`\n  …还有 ${dupes.length - 30} 组。`);
  console.log();
}

/**
 * Where two titles stop agreeing — the one number that says whether a
 * same-buyer, same-reference pair is two different jobs or one job whose
 * notice was corrected. Reported as a 1-based character position.
 */
function firstDifference(titles: string[]): number {
  const [first, ...rest] = titles;
  for (let i = 0; i < first.length; i += 1) {
    if (rest.some((other) => other[i] !== first[i])) return i + 1;
  }
  return first.length + 1;
}

async function checkColombiaSource(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`【源头】拉取 datos.gov.co ${since.toISOString().slice(0, 10)} 之后发布的招标...`);
  const rows = await fetchSecopProcesos({ sinceDate: since });

  const bySlug = new Map<string, { entity: string; title: string; reference: string; processId: string; published: string }[]>();
  for (const row of rows) {
    if (!isIngestedColombiaModalidad(row.modalidad_de_contratacion)) continue;
    const tender = mapSecopRowToTender(row, SOURCE_NAME);
    if (!tender) continue;
    const entry = {
      entity: row.entidad?.trim() ?? "(no entity)",
      title: tender.title.es,
      reference: row.referencia_del_proceso?.trim() ?? "",
      processId: row.id_del_proceso?.trim() ?? "",
      published: (row.fecha_de_publicacion_del ?? "").slice(0, 10),
    };
    const list = bySlug.get(tender.slug);
    if (list) list.push(entry);
    else bySlug.set(tender.slug, [entry]);
  }

  // Two rows are only a real collision when they are different PROCUREMENTS,
  // and `id_del_proceso` does NOT answer that question. SECOP II republishes
  // one procurement under a NEW id (a new phase, a corrected notice), so the
  // same tender routinely appears as CO1.REQ.11024717 and CO1.REQ.10892101 —
  // same entity, same reference, same title. Keying the de-dup on the process
  // id counted every one of those as a separate project and reported 60
  // "collisions" the day the slug fix landed, every one of them a tender
  // collapsing exactly as buildSecopSlug() intends.
  //
  // A procurement's identity, for this platform's purposes, is its BUYER plus
  // its TITLE — compared in full, not truncated for display. Two rows sharing
  // a slug are a real collision only when one of those differs.
  //
  // (The other wrong number this script has produced: the very first version
  // counted the feed's repeated copies of one record as separate projects —
  // one municipality's row appeared 15 times in a single 30-day window — and
  // reported 579 losses over 60 days. A number that overstates a real problem
  // is still a wrong number.)
  const identity = (entry: { entity: string; title: string }) =>
    `${entry.entity.trim().toUpperCase()}::${entry.title.replace(/\s+/g, " ").trim().toUpperCase()}`;

  const distinctBySlug = new Map<string, { entity: string; title: string; reference: string; processId: string; published: string }[]>();
  let republishedCount = 0;
  for (const [slug, list] of bySlug) {
    const seen = new Map<string, (typeof list)[number]>();
    for (const entry of list) if (!seen.has(identity(entry))) seen.set(identity(entry), entry);
    if (list.length > seen.size) republishedCount += 1;
    distinctBySlug.set(slug, [...seen.values()]);
  }
  const collisions = [...distinctBySlug.entries()].filter(([, list]) => list.length > 1);

  console.log(`共 ${rows.length} 条（去重后 ${[...distinctBySlug.values()].reduce((n, l) => n + l.length, 0)} 个不同项目），映射到 ${distinctBySlug.size} 个 slug，其中 ${collisions.length} 个 slug 被不止一个真实项目占用。`);
  console.log(`另有 ${republishedCount} 个 slug 收到同一个标的多个版本（同单位、同编号、同标题，只是 id_del_proceso 不同）——这是 buildSecopSlug 有意合并的，不是撞号。\n`);
  for (const [slug, list] of collisions.slice(0, 25)) {
    console.log(`  ${slug}   ← ${list.length} 个不同项目挤在这一个 ID 上`);
    // FULL titles, not the 60-char display truncation used elsewhere. These
    // groups already agree on buyer and reference, so the ONLY thing that
    // tells a real collision (one entity reusing a reference for two
    // different jobs) from a corrected re-publication (one word edited) is
    // where the titles diverge — and that is almost always past the point a
    // truncated line would show. Printing a prefix here is what made the
    // last two wrong numbers in this script hard to spot.
    for (const entry of list) {
      console.log(`     ${entry.processId.padEnd(20)} ${entry.published}  ${entry.entity}`);
      console.log(`       ${entry.title}`);
    }
    console.log(`     ↑ 标题从第 ${firstDifference(list.map((e) => e.title))} 个字符开始不同`);
    console.log();
  }
  if (collisions.length > 25) console.log(`  …还有 ${collisions.length - 25} 组。\n`);

  if (collisions.length > 0) {
    const lost = collisions.reduce((sum, [, list]) => sum + list.length - 1, 0);
    console.log(
      `结论：这 ${days} 天里，至少有 ${lost} 条项目在导入时会被同 slug 的另一条覆盖掉，而且不会有任何报错。\n` +
        `slug 现在是 secop-<nit_entidad>-<referencia>（colombia-mapper.ts 的 buildSecopSlug），同编号不同单位不该再撞。\n` +
        `上面每一组的「采购单位 + 标题」都不一样才会被算进来——同一个标的重新发布已经排除了。\n` +
        `还在撞，最可能是这些行的 nit_entidad 和 codigo_entidad 都是空的，请把上面的例子贴出来。`,
    );
  } else {
    console.log(`结论：这 ${days} 天里没有一个 slug 被两个不同项目占用——entity-qualified slug（buildSecopSlug）生效了。`);
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
