/**
 * What Peru's procedure types are actually worth, before anything is filtered
 * on them.
 *
 * The question (2026-09-18): Peru publishes a great many tenders with no
 * `valor referencial` at all, and once a bid document is analysed they often
 * turn out to be a few hundred thousand soles — too small, and no rule could
 * have known, because the rule that catches small tenders is a VALUE floor
 * and there was no value.
 *
 * Peru's own procurement law already sorts procedures by amount:
 * Licitación Pública and Concurso Público sit above a statutory threshold,
 * Adjudicación Simplificada below it. That is a size signal carried in a
 * field this platform ALREADY stores (`procedureType`, from OCDS
 * `procurementMethodDetails`), needing no value at all — the same shape as
 * the Subasta Inversa and Comparación de Precios rules already in force.
 *
 * So: excluding Adjudicación Simplificada looked right. This script exists
 * because "looked right" is not a number, and because the Colombia survey
 * taught the same lesson twice — a filter decided on a guessed count gets
 * decided wrongly, and a survey that quietly samples while sounding like a
 * census is worse than no survey.
 *
 * ── THE ANSWER (2026-09-18, run over 2026-08 and 2026-09, 10,177 records) ──
 *
 * The rule was NOT shipped. The premise was obsolete.
 *
 *   Adjudicación Simplificada:  12 of 10,177 source rows (0.1%).
 *   Excluding it would have removed TWO tenders from the feed.
 *
 * SEACE has renamed the tier. The two largest procedures in the window are
 * `Licitación Pública Abreviada` (3,289, 32.3%) and `Concurso Público
 * Abreviado` (2,734, 26.9%) — 59% of the source between them — and one row
 * in the same histogram cites `Ley N°32069` by name. Adjudicación
 * Simplificada is vestigial; the abbreviated procedures are the live tier.
 *
 * And the obvious follow-up — "then exclude the Abreviada ones instead" —
 * is refuted by the same run, which is why sections 3 and 5 exist:
 *
 *   Licitación Pública Abreviada contributes 184 of the 453 kept tenders
 *   (40.6%, the largest single contributor), 130 of them disclose a value,
 *   and their MEDIAN is $1,129,745 — well above the $800k floor.
 *
 * Excluding it would delete 40% of the Peru feed, most of it real money the
 * value floor is already judging correctly. Procedure type is not the lever
 * for Peru. Do not re-propose this without re-running the survey.
 *
 * What the run did establish: 159 of the 453 kept tenders (35%) disclose no
 * value at all, spread across procedures rather than concentrated in one, so
 * no procedure-name rule can reach them. The number is in the bid document —
 * a valor referencial is mandatory there — and the extraction schema does not
 * capture it. That is the remaining lever.
 *
 * Read-only. It fetches the source and classifies in memory; it writes
 * nothing, touches no database, and makes no model calls.
 *
 * Usage:
 *   npm run survey:peru-procedures                 (last 2 month segments)
 *   npm run survey:peru-procedures -- --months 6
 *   npm run survey:peru-procedures -- --segment 2026-09
 */
import { fetchOeceRecordsForSegment, recentSegmentIds } from "../lib/ingestion/connectors/peru-oece-live";
import { mapOeceRecordToTender, type OeceRecord } from "../lib/ingestion/peru-oece-mapper";
import { isPastSubmissionDeadline } from "../lib/ingestion/recency";
import { convertToUsd } from "../lib/currency";
import type { Tender } from "../types/tender";

const SOURCE_NAME = "SEACE / OECE — Perú";

/**
 * The candidate rule, written once here so the report and any future
 * relevance.ts entry cannot drift apart. Matches the procedure NAME as the
 * entity itself declared it — `Adjudicación Simplificada`, with or without
 * accents, and the "Adjudicación Simplificada - Derivada de ..." forms SEACE
 * also emits.
 */
export const ADJUDICACION_SIMPLIFICADA = /adjudicaci[óo]n\s+simplificada/i;

/** The other small-value procedures already excluded, so the report can say what is genuinely NEW versus already handled. */
const ALREADY_EXCLUDED_PROCEDURES = /subasta\s+inversa|comparaci[óo]n\s+de\s+precios|adjudicaci[óo]n\s+directa|contrataci[óo]n\s+directa/i;

/**
 * One label for "the source did not name a procedure", used by BOTH tables.
 *
 * Section 1 reads the raw OCDS field and section 3 reads the mapped tender,
 * and mapOeceRecordToTender() substitutes the literal "Unknown" for an absent
 * value. Left alone, the same rows appeared as "(未声明)" in one table and
 * "Unknown" in the other, and the two tables would read as though they
 * disagreed about a category.
 */
export function procedureLabel(raw: string | undefined): string {
  const name = raw?.trim();
  if (!name || name.toLowerCase() === "unknown") return "(未声明)";
  return name;
}

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

function usd(tender: Tender): number | undefined {
  if (tender.estimatedValue === undefined) return undefined;
  return convertToUsd(tender.estimatedValue, tender.currency) ?? undefined;
}

function money(value: number | undefined): string {
  return value === undefined ? "无金额" : `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Median rather than mean: one $40M outlier in a list of village contracts makes a mean say the opposite of what the list shows. */
export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

type Row = { tender: Tender; procedure: string };

async function main() {
  const args = process.argv.slice(2);
  const segment = argValue(args, "--segment");
  const months = Number(argValue(args, "--months") ?? 2);
  const segments = segment ? [segment] : recentSegmentIds(months);

  console.log(`【窗口】${segments.join("、")}（共 ${segments.length} 个月段）\n`);

  const records: OeceRecord[] = [];
  for (const id of segments) {
    const fetched = await fetchOeceRecordsForSegment({ dataSegmentationId: id }, (page, soFar) => {
      if (page === 1 || page % 20 === 0) console.log(`  ${id}: 第 ${page} 页，累计 ${soFar} 条`);
    });
    console.log(`  ${id}: ${fetched.length} 条记录`);
    // The connector stops at 2000 pages of 100, so a segment returning
    // exactly 200,000 rows is a segment that was CUT, not a segment that
    // happened to end there — and every number below it would then be a
    // sample wearing a census's clothes. Said out loud because a survey that
    // silently truncates is worse than no survey; this is the same failure
    // the Colombia survey shipped once.
    if (fetched.length >= 200_000) {
      console.log(`  ⚠ ${id} 撞到了连接器的 2000 页上限（200,000 条）——这一段被截断了，下面所有数字都只是它的一部分。`);
    }
    records.push(...fetched);
  }
  console.log();

  // ── 【1】程序类型普查 ───────────────────────────────────────────────
  // Counted off the RAW records, before mapping — so this is every row the
  // source returned for the window, not the subset that survived our own
  // code. A histogram taken after mapping would answer a different question
  // and look identical, which is the mistake the Colombia survey made once.
  const rawByProcedure = new Map<string, number>();
  for (const record of records) {
    const name = procedureLabel(record.compiledRelease?.tender?.procurementMethodDetails);
    rawByProcedure.set(name, (rawByProcedure.get(name) ?? 0) + 1);
  }
  console.log(`【1】源头程序类型分布（${records.length} 条原始记录，映射之前）\n`);
  const rawSorted = [...rawByProcedure.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, count] of rawSorted) {
    const mark = ADJUDICACION_SIMPLIFICADA.test(name) ? " ←候选排除" : ALREADY_EXCLUDED_PROCEDURES.test(name) ? " （已排除）" : "";
    console.log(`  ${String(count).padStart(6)}  ${pct(count, records.length).padStart(6)}  ${name}${mark}`);
  }
  console.log();

  // ── 【2】过我们自己的分类器之后 ────────────────────────────────────
  const rows: Row[] = [];
  for (const record of records) {
    const tender = mapOeceRecordToTender(record, SOURCE_NAME);
    if (!tender) continue;
    rows.push({ tender, procedure: procedureLabel(tender.procedureType) });
  }

  // The two gates that stand between "classified" and "actually written",
  // both applied here rather than assumed — the Colombia dry run reported ten
  // times the real write count by skipping exactly this step, and it is the
  // number a person reads before deciding to write.
  const live = rows.filter((r) => !isPastSubmissionDeadline(r.tender));
  const kept = live.filter((r) => r.tender.relevance.tier !== "excluded");

  console.log(`【2】经过映射和相关度分类之后\n`);
  console.log(`  ${rows.length} 条映射成功`);
  console.log(`  ${rows.length - live.length} 条已过交标截止（不会写入）`);
  console.log(`  ${live.length - kept.length} 条被相关度规则排除（不会写入）`);
  console.log(`  ${kept.length} 条会进入系统`);
  console.log(`  注：实际写入还会再减去手动删除墓碑（需查库），所以真实值等于或略小于 ${kept.length}。\n`);

  // ── 【3】每种程序类型贡献了多少「会进入系统」的项目 ─────────────────
  const keptByProcedure = new Map<string, Row[]>();
  for (const row of kept) {
    const list = keptByProcedure.get(row.procedure);
    if (list) list.push(row);
    else keptByProcedure.set(row.procedure, [row]);
  }
  console.log(`【3】会进入系统的 ${kept.length} 条，按程序类型拆开\n`);
  console.log(`  ${"条数".padStart(6)}  ${"占比".padStart(6)}  ${"有金额".padStart(6)}  ${"金额中位数".padStart(12)}  程序类型`);
  for (const [name, list] of [...keptByProcedure.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const values = list.map((r) => usd(r.tender)).filter((v): v is number => v !== undefined);
    const mark = ADJUDICACION_SIMPLIFICADA.test(name) ? " ←候选排除" : "";
    console.log(
      `  ${String(list.length).padStart(6)}  ${pct(list.length, kept.length).padStart(6)}  ` +
        `${String(values.length).padStart(6)}  ${money(median(values)).padStart(12)}  ${name}${mark}`,
    );
  }
  console.log();

  // ── 【4】排除 Adjudicación Simplificada 的确切代价 ──────────────────
  const wouldLose = kept.filter((r) => ADJUDICACION_SIMPLIFICADA.test(r.procedure));
  const wouldKeep = kept.length - wouldLose.length;
  console.log(`【4】如果排除 Adjudicación Simplificada\n`);
  console.log(`  会少掉 ${wouldLose.length} 条（占当前会进入系统的 ${pct(wouldLose.length, kept.length)}）`);
  console.log(`  剩下 ${wouldKeep} 条\n`);

  const byTier = new Map<string, Row[]>();
  for (const row of wouldLose) {
    const list = byTier.get(row.tender.relevance.tier);
    if (list) list.push(row);
    else byTier.set(row.tender.relevance.tier, [row]);
  }
  for (const tier of ["flagship", "significant", "standard"]) {
    const list = byTier.get(tier) ?? [];
    const values = list.map((r) => usd(r.tender)).filter((v): v is number => v !== undefined);
    console.log(`  ${tier.padEnd(12)} ${String(list.length).padStart(5)} 条   有金额 ${values.length} 条   中位数 ${money(median(values))}`);
  }
  console.log();

  // ── 【5】会失去的最大的那些 ────────────────────────────────────────
  // The whole decision turns on this list. A rule that removes 300 village
  // contracts is obviously right; the same rule removing one $8M highway is
  // a different rule, and only the titles can say which it is.
  const withValue = wouldLose
    .map((r) => ({ row: r, value: usd(r.tender) }))
    .filter((e): e is { row: Row; value: number } => e.value !== undefined)
    .sort((a, b) => b.value - a.value);

  console.log(`【5】排除后会失去的金额最大的 20 条——这一节决定这条规则对不对\n`);
  if (withValue.length === 0) {
    console.log(`  这批 Adjudicación Simplificada 里没有任何一条公布了金额。`);
    console.log(`  那么按金额判断它们的大小是不可能的，这正是改用程序类型的理由。\n`);
  } else {
    for (const { row, value } of withValue.slice(0, 20)) {
      console.log(`  ${money(value).padStart(14)}  ${row.tender.relevance.tier.padEnd(12)}  ${row.tender.title.es.slice(0, 96)}`);
    }
    console.log();
    const over1m = withValue.filter((e) => e.value >= 1_000_000).length;
    console.log(`  其中 ${over1m} 条在 $1,000,000 以上。这个数字如果不是 0，就要想清楚再开这条规则。\n`);
  }

  // 无金额的那一批——本来就是这次讨论的起点
  const noValue = wouldLose.filter((r) => usd(r.tender) === undefined);
  console.log(`【6】会失去的项目里，${noValue.length} 条根本没有金额（占 ${pct(noValue.length, wouldLose.length)}）\n`);
  for (const row of noValue.slice(0, 10)) {
    console.log(`  ${row.tender.relevance.tier.padEnd(12)}  ${row.tender.title.es.slice(0, 100)}`);
  }
  if (noValue.length > 10) console.log(`  …还有 ${noValue.length - 10} 条。`);
  console.log(`\n  这些就是当初提出问题的那一类：没有金额，金额下限管不到，只有程序类型能说明它们的档次。`);
}

// Guarded, unlike the other scripts here, because this file EXPORTS the
// candidate rule (ADJUDICACION_SIMPLIFICADA) so that whatever eventually adds
// it to lib/relevance.ts, and any test of it, read the same regex this report
// measured rather than a retyped copy. A bare `main()` made those exports
// unusable: importing the constant fired a live OECE fetch.
if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
