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
/**
 * Modalidades whose rows can pass every relevance rule and still not be a
 * thing anyone can bid on. relevance.ts cannot catch these: its rules read
 * the subject matter, and the subject matter of an RFI is a genuine, often
 * large project — the problem is the legal figure, not the content.
 *
 * Kept here as a warning rather than as a filter because this script only
 * measures; deciding what to do about one is the user's call.
 */
const NOT_BIDDABLE_MODALIDADES: [RegExp, string][] = [
  [
    /solicitud de informaci[óo]n/i,
    "这是 RFI（市场问询），不是招标 —— 采购单位在摸市场行情，没有可提交的标。它常常是真实大项目的前奏，" +
      "所以当“早期信号”有价值，但按标书导进来，订阅者点进去会发现无标可投。",
  ],
  [
    /enajenaci[óo]n de bienes/i,
    "这是政府在【卖】资产（拍卖处置），不是采购 —— 方向反了，中国企业是买方不是卖方。",
  ],
  [/subasta de prueba/i, "字面意思是“测试用的拍卖”，SECOP 的测试数据，不是真实项目。"],
];

/** The phrase unique to relevance.ts's short_duration reason. Same regex-not-equality reasoning as VALUE_REASON_MARKER below: the day count is interpolated into that text. */
const DURATION_REASON_MARKER = /执行\/交付周期低于/;

/** The phrase unique to relevance.ts's valueExcludedReason() — see its use below for why this is a regex and not an equality check. */
const VALUE_REASON_MARKER = /预估金额低于/;

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

    // Surviving every relevance rule is not the same as being biddable, and
    // nothing in relevance.ts knows the difference — its rules judge what a
    // tender is ABOUT, never what legal figure it is. A modalidad named here
    // would arrive looking exactly like a real tender.
    for (const [modalidad, count] of survivorsByModalidad) {
      const warning = NOT_BIDDABLE_MODALIDADES.find(([pattern]) => pattern.test(modalidad))?.[1];
      if (warning) console.log(`\n  ⚠️  「${modalidad}」那 ${count} 条：${warning}`);
    }
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

  // The band table above counts EVERY in-gate row, whatever tier it landed
  // in, so "144 rows under $800k" does NOT mean 144 rows the floor rejected.
  // In classifyRelevance()'s precedence the keyword and duration rules run
  // BEFORE the value floor, so most sub-floor rows were already gone by the
  // time the floor was consulted and lowering it would not bring back one of
  // them. The only rows a lower floor rescues are the ones excluded FOR the
  // value reason — counted here directly instead of inferred from the bands.
  // (The first version of this script inferred it, and reported ~35 rescuable
  // when the real answer was a handful.)
  console.log(
    `\n  有金额的 ${inGate.length - noValue} 条里，${belowFloor} 条在 $800k 以下 —— ` +
      `但这不等于“下限拦下了 ${belowFloor} 条”。关键词和工期规则排在金额下限前面，` +
      `绝大多数低于下限的行在轮到金额之前就已经出局了。`,
  );
  // Identified by the one phrase only valueExcludedReason() produces. The
  // threshold number is interpolated into that text, so an equality check
  // against a hardcoded string would break the day MIN_VALUE_USD moves —
  // which is precisely the day someone runs this script.
  const rescuable = excludedInGate
    .filter((m) => VALUE_REASON_MARKER.test(m.tender.relevance.reason.zh))
    .map((m) => usdValue(m.tender))
    .filter((usd): usd is number => usd !== undefined)
    .sort((a, b) => b - a);
  if (rescuable.length === 0) {
    console.log(`  真正因为“金额太小”被拦下的：0 条 —— 调下限不会救回任何一条。`);
  } else {
    console.log(
      `  真正因为“金额太小”被拦下的只有 ${rescuable.length} 条，金额从高到低：` +
        `${rescuable.slice(0, 10).map((v) => `$${Math.round(v).toLocaleString()}`).join("、")}` +
        `${rescuable.length > 10 ? " …" : ""}`,
    );
    for (const candidate of [500_000, 300_000, 100_000]) {
      const saved = rescuable.filter((v) => v >= candidate).length;
      console.log(`    下限退到 $${candidate.toLocaleString()} → 救回 ${saved} 条`);
    }
  }
  console.log(`  想多拿标，该先看上面【3】里条数最多的那一组，不是这里。`);

  // 5. The duration rule, measured the same way — because on the first real
  //    run it excluded four times as many rows as the value floor did, and
  //    among them a $2.9M road improvement. The rule reads
  //    `durationDays < 180` and returns excluded without ever consulting the
  //    value, so a large project on a five-month schedule is dropped for its
  //    schedule. Duration is a PROXY for scale; value is the direct measure.
  //    This prints what it would cost to let the direct measure win, so that
  //    decision is a number rather than an intuition.
  const durationExcluded = excludedInGate
    .filter((m) => DURATION_REASON_MARKER.test(m.tender.relevance.reason.zh))
    .map((m) => ({ usd: usdValue(m.tender), title: m.tender.title.zh, buyer: m.tender.buyer }))
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));

  console.log(`\n【5】工期规则（< 180 天）拦下的 ${durationExcluded.length} 条 —— 它完全不看金额：`);
  if (durationExcluded.length === 0) {
    console.log(`  （没有。）`);
  } else {
    const withValue = durationExcluded.filter((d) => d.usd !== undefined);
    console.log(
      `  其中 ${withValue.length} 条是有金额的，${durationExcluded.length - withValue.length} 条没金额` +
        `（没金额的一律留在排除里 —— 没有直接指标可以推翻代理指标）。`,
    );
    for (const candidate of [800_000, 1_000_000, 2_000_000]) {
      const saved = withValue.filter((d) => (d.usd ?? 0) >= candidate).length;
      console.log(`    若「金额 ≥ $${candidate.toLocaleString()} 时工期规则让位」→ 救回 ${saved} 条`);
    }
    console.log(`\n  金额最高的 10 条（这些就是这条规则现在正在扔掉的东西）：`);
    for (const d of durationExcluded.slice(0, 10)) {
      console.log(`    ${(d.usd ? `$${Math.round(d.usd).toLocaleString()}` : "无金额").padStart(14)}  ${d.buyer} — ${d.title.slice(0, 90)}`);
    }
  }

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
