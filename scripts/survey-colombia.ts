/**
 * Why Colombia looks small next to Mexico and Peru — measured, not guessed.
 *
 * The question this exists to answer (user, 2026-09-15): "当前哥伦比亚的项目
 * 数量偏少，是不是因为我们只导入了 SECOP II?" There are three candidate
 * explanations and they call for completely different work, so guessing
 * between them is expensive:
 *
 *   1. SOURCE COVERAGE — SECOP II genuinely does not carry these tenders,
 *      and we would need SECOP I / TVEC / a state portal. (Probe those with
 *      `npm run probe:colombia-sources`, not this script.)
 *   2. THE MODALIDAD GATE — SECOP II carries them, but
 *      `isIngestedColombiaModalidad()` drops everything that is not
 *      "Licitación pública" (the user's own explicit instruction,
 *      2026-09-11). Territorial entities lean on Selección Abreviada and
 *      Régimen Especial far more than on Licitación Pública, so this gate
 *      is a coverage decision as much as a quality one.
 *   3. THE $800k VALUE FLOOR — Colombia rows usually carry a real
 *      `precio_base` while Mexico's open-tenders rows usually carry no
 *      value at all, and `MIN_VALUE_USD` only applies when a value is
 *      KNOWN. So the same floor that barely touches Mexico can cut deeply
 *      into Colombia. This asymmetry is structural and no new source fixes
 *      it.
 *
 * This prints the evidence for (2) and (3) side by side, plus the current
 * excluded list broken down by the reason each row was excluded for — the
 * second half of the same request ("同步我也想再看一下当前哥伦比亚的
 * excluded 清单").
 *
 * Read-only. Touches datos.gov.co and nothing else — no Supabase, no
 * writes, no upserts. The only artifact is a CSV under exports/.
 *
 * Usage:
 *   npm run survey:colombia                      (最近 30 天，当前 modalidad 门槛)
 *   npm run survey:colombia -- --days=90
 *   npm run survey:colombia -- --all-modalidades (不加门槛：量化"放宽能多多少")
 *   npm run survey:colombia -- --examples=8
 */
import { mapSecopRowToTender, isIngestedColombiaModalidad, type SecopProcesoRow } from "../lib/ingestion/colombia-mapper";
import { convertToUsd } from "../lib/currency";
import { toCsv, writeReviewCsv } from "../lib/ingestion/review-csv";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "SECOP II — Colombia Compra Eficiente";
const ENDPOINT = "https://www.datos.gov.co/resource/p6dx-8zbt.json";
const PAGE_SIZE = 1000;

const args = process.argv.slice(2);
const DAYS = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);
const EXAMPLES = Number(args.find((a) => a.startsWith("--examples="))?.split("=")[1] ?? 5);
const ALL_MODALIDADES = args.includes("--all-modalidades");
/**
 * Higher than the connector's own cap on purpose. Dropping the `%icitaci%`
 * filter multiplies the row count by roughly two orders of magnitude — a
 * 30-day window is ~550 rows filtered and tens of thousands unfiltered —
 * and a cap that silently truncates would make the widening look SMALLER
 * than it is, which is the one wrong answer this script must not give.
 */
const MAX_PAGES = Number(args.find((a) => a.startsWith("--max-pages="))?.split("=")[1] ?? (ALL_MODALIDADES ? 60 : 10));

function soqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19);
}

async function fetchRows(sinceDate: Date): Promise<{ rows: SecopProcesoRow[]; truncated: boolean }> {
  const where =
    `fecha_de_publicacion_del >= '${soqlTimestamp(sinceDate)}'` +
    (ALL_MODALIDADES ? "" : ` AND modalidad_de_contratacion like '%icitaci%'`);

  const rows: SecopProcesoRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("$where", where);
    // Same tiebreaker as the production connector: fecha_de_publicacion_del
    // is far from unique, and $offset paging over a non-unique sort key can
    // return one row twice and another never.
    url.searchParams.set("$order", "fecha_de_publicacion_del DESC, id_del_proceso ASC");
    url.searchParams.set("$limit", String(PAGE_SIZE));
    url.searchParams.set("$offset", String(page * PAGE_SIZE));

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`datos.gov.co 返回 ${response.status} ${response.statusText}（第 ${page + 1} 页）`);
    }
    const pageRows = (await response.json()) as SecopProcesoRow[];
    rows.push(...pageRows);
    process.stdout.write(`\r  已拉取 ${rows.length} 行...`);
    if (pageRows.length < PAGE_SIZE) {
      process.stdout.write("\n");
      return { rows, truncated: false };
    }
  }
  process.stdout.write("\n");
  return { rows, truncated: true };
}

function normalizeModalidad(value: string | undefined): string {
  return value?.trim() || "(空)";
}

function usdValue(tender: Tender): number | undefined {
  if (tender.estimatedValue === undefined) return undefined;
  return convertToUsd(tender.estimatedValue, tender.currency) ?? undefined;
}

/**
 * Bands chosen around the live floor (MIN_VALUE_USD = $800,000) rather than
 * round decades, because the actionable question is not "how big are these"
 * but "how many sit just under the line" — i.e. how much a floor change
 * would actually rescue. A band ending exactly at 800k and one starting
 * there make that readable at a glance.
 */
const VALUE_BANDS: [string, number, number][] = [
  ["< $100k", 0, 100_000],
  ["$100k – $300k", 100_000, 300_000],
  ["$300k – $500k", 300_000, 500_000],
  ["$500k – $800k", 500_000, 800_000],
  ["$800k – $2M", 800_000, 2_000_000],
  ["$2M – $10M", 2_000_000, 10_000_000],
  ["> $10M", 10_000_000, Infinity],
];

function bandFor(usd: number): string {
  for (const [label, low, high] of VALUE_BANDS) {
    if (usd >= low && usd < high) return label;
  }
  return "> $10M";
}

function bar(count: number, max: number, width = 28): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(1, Math.round((count / max) * width)));
}

function printCounts(title: string, counts: Map<string, number>, total: number, limit = 40): void {
  console.log(`\n${title}`);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = sorted[0]?.[1] ?? 0;
  for (const [label, count] of sorted) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${String(count).padStart(6)}  ${pct.padStart(5)}%  ${bar(count, max)}  ${label}`);
  }
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function main() {
  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  console.log(
    `SECOP II 体检 — 最近 ${DAYS} 天（${since.toISOString().slice(0, 10)} 起）` +
      `，${ALL_MODALIDADES ? "不加 modalidad 门槛（what-if）" : "当前 modalidad 门槛（%icitaci%）"}\n`,
  );

  const { rows, truncated } = await fetchRows(since);
  if (truncated) {
    console.log(
      `\n⚠️  拉到 ${MAX_PAGES} 页上限就停了，下面的数字是“至少这么多”，不是全量。` +
        `加 --max-pages=<更大的数> 重跑才能看到完整分布。\n`,
    );
  }
  console.log(`源头共 ${rows.length} 行。\n`);

  // 1. What the source actually holds, before any of our rules.
  const byModalidad = new Map<string, number>();
  for (const row of rows) bump(byModalidad, normalizeModalidad(row.modalidad_de_contratacion));
  printCounts(`【1】源头 modalidad 分布（这是哥伦比亚政府实际在发什么）`, byModalidad, rows.length);

  const gatePassed = rows.filter((r) => isIngestedColombiaModalidad(r.modalidad_de_contratacion));
  console.log(
    `\n  当前门槛只收 “Licitación pública / Licitación pública Obra Pública”：` +
      `${gatePassed.length} / ${rows.length} 行通过（${((gatePassed.length / Math.max(1, rows.length)) * 100).toFixed(1)}%）。`,
  );

  // 2. Run the REAL pipeline over every row — gate ignored — so the tier
  //    breakdown per modalidad says what widening the gate would actually
  //    buy, after the value floor and the keyword rules have had their say.
  type Mapped = { row: SecopProcesoRow; tender: Tender; modalidad: string; gatePasses: boolean };
  const mapped: Mapped[] = [];
  let unmappable = 0;
  for (const row of rows) {
    const tender = mapSecopRowToTender(row, SOURCE_NAME, { ignoreModalidadGate: true });
    if (!tender) {
      unmappable += 1;
      continue;
    }
    mapped.push({
      row,
      tender,
      modalidad: normalizeModalidad(row.modalidad_de_contratacion),
      gatePasses: isIngestedColombiaModalidad(row.modalidad_de_contratacion),
    });
  }
  console.log(`  ${unmappable} 行连映射都过不了（缺标题/发标单位/编号/发布日期），任何门槛都救不回来。`);

  const inGate = mapped.filter((m) => m.gatePasses);
  const outOfGate = mapped.filter((m) => !m.gatePasses);

  const tierOf = (m: Mapped) => m.tender.relevance.tier;
  const keepable = (m: Mapped) => tierOf(m) !== "excluded";

  console.log(
    `\n【2】跑完全部规则之后（价格下限、关键词、直接授标… 一个没少）：\n` +
      `  门槛内：${inGate.length} 条映射成功，其中 ${inGate.filter(keepable).length} 条会真的进库` +
      `（${inGate.length - inGate.filter(keepable).length} 条 excluded）。`,
  );
  if (ALL_MODALIDADES) {
    console.log(
      `  门槛外：${outOfGate.length} 条映射成功，其中 ${outOfGate.filter(keepable).length} 条会进库 —— ` +
        `这就是“放宽 modalidad 能多拿多少”的真实答案。`,
    );

    // Per-modalidad, only what would survive everything else. A modalidad
    // with a big raw count but nothing surviving is not worth opening.
    const survivorsByModalidad = new Map<string, number>();
    for (const m of outOfGate) if (keepable(m)) bump(survivorsByModalidad, m.modalidad);
    printCounts(`  按 modalidad 看，放宽后能真正进库的条数：`, survivorsByModalidad, outOfGate.filter(keepable).length);
  }

  // 3. The excluded list for what we ingest TODAY, grouped by the reason
  //    each row was excluded for. Grouped on the stored reason text itself
  //    rather than a re-derived signal name: the reason IS the bucket, and
  //    re-deriving it here would be a second copy of relevance.ts's own
  //    precedence order that drifts the first time that order changes.
  const excludedInGate = inGate.filter((m) => !keepable(m));
  const byReason = new Map<string, number>();
  const examplesByReason = new Map<string, string[]>();
  for (const m of excludedInGate) {
    const reason = m.tender.relevance.reason.zh;
    bump(byReason, reason);
    const bucket = examplesByReason.get(reason) ?? [];
    if (bucket.length < EXAMPLES) {
      const usd = usdValue(m.tender);
      bucket.push(`${m.tender.title.zh}${usd ? `  [约 $${Math.round(usd).toLocaleString()}]` : "  [无金额]"}`);
      examplesByReason.set(reason, bucket);
    }
  }

  console.log(
    `\n【3】当前口径下被 excluded 掉的 ${excludedInGate.length} 条（门槛内、最近 ${DAYS} 天），按原因分组：`,
  );
  const sortedReasons = [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sortedReasons) {
    console.log(`\n  ── ${count} 条 ──────────────────────────`);
    console.log(`  ${reason}`);
    for (const example of examplesByReason.get(reason) ?? []) console.log(`     · ${example}`);
  }
  if (sortedReasons.length === 0) console.log(`  （没有 —— 门槛内的每一条都进库了。）`);

  // 4. Where the money actually sits, relative to the floor.
  const valueBands = new Map<string, number>();
  let noValue = 0;
  for (const m of inGate) {
    const usd = usdValue(m.tender);
    if (usd === undefined) noValue += 1;
    else bump(valueBands, bandFor(usd));
  }
  printCounts(
    `【4】门槛内各条的参考金额（COP 折 USD）—— 价格下限目前是 $800,000，` +
      `另有 ${noValue} 条源头没给金额（没金额就不受下限约束）：`,
    valueBands,
    inGate.length - noValue,
  );
  const belowFloor = ["< $100k", "$100k – $300k", "$300k – $500k", "$500k – $800k"].reduce(
    (sum, band) => sum + (valueBands.get(band) ?? 0),
    0,
  );
  const nearFloor = valueBands.get("$500k – $800k") ?? 0;
  console.log(
    `\n  有金额的 ${inGate.length - noValue} 条里，${belowFloor} 条在 $800k 以下；` +
      `其中 ${nearFloor} 条落在 $500k–$800k —— 下限退回 $500k 就能救回这一格，别的格不受影响。`,
  );

  // 5. The full excluded list on disk, because a five-example sample is for
  //    deciding WHICH bucket to read, not for reading the bucket.
  const path = writeReviewCsv({
    dir: "exports",
    baseName: `colombia-excluded-${new Date().toISOString().slice(0, 10)}`,
    csv: toCsv(
      ["modalidad", "门槛内", "发标单位", "标书编号", "标题", "参考金额USD", "档位", "排除原因", "链接"],
      mapped
        .filter((m) => !keepable(m))
        .map((m) => [
          m.modalidad,
          m.gatePasses ? "是" : "否",
          m.tender.buyer,
          m.tender.tenderNumber,
          m.tender.title.zh,
          usdValue(m.tender)?.toFixed(0) ?? "",
          m.tender.relevance.tier,
          m.tender.relevance.reason.zh,
          m.tender.sourceUrl,
        ]),
    ),
    label: "survey-colombia",
    failureNote: "上面的统计已经打印完了，丢的只是明细表",
  });
  if (path) console.log(`\n全部 excluded 明细 -> ${path}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
