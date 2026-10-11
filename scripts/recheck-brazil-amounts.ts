/**
 * Re-ask PNCP for the amount of Brazilian tenders that went in without one
 * because PNCP refused the lookup, re-tier them on it, and remove the ones
 * the platform's rules would never have let in.
 *
 * User, 2026-10-11: 今天一口气导了198个项目进来 … 只留有价值的项目. The
 * 20:00 run had PNCP refuse its amount lookups at row 15 of 519, so 192 small
 * works were written as 常规 with no amount to tier them on — and a later run
 * never moves a stored row to 已过滤, so they would have stayed. The import now
 * holds such rows back (heldBackForAmount, lib/ingestion/ingest-brazil.ts);
 * this cleans up the ones already in.
 *
 * Only rows that are: PNCP, first written in the last --hours (default 36),
 * still without an amount, not tier-locked by an admin, amount not typed by
 * an admin, and never analysed (no 一句话总结, no analysed document).
 *
 * For each, the same item lookup and the same sum the import uses
 * (fetchPncpItems, sumPncpItemValues), then the same classifier
 * (classifyStoredTender) on the stored text:
 *   - would be 已过滤 → deleted (not tombstoned: the import never writes an
 *     excluded row anyway, so nothing needs blocking);
 *   - kept → amount and tier written;
 *   - PNCP answered with no amount (sealed budget, no items) → left as it is,
 *     which is what the import does with such a row;
 *   - PNCP refused again → left as it is; run this again later.
 *
 *   npm run recheck:brazil-amounts                 (preview)
 *   npm run recheck:brazil-amounts -- --write
 *   npm run recheck:brazil-amounts -- --hours 72
 *
 * PNCP has to be reachable from where this runs. A laptop often cannot reach
 * .gov.br hosts at all (see .github/workflows/probe-brazil-doors.yml), so it
 * checks first and stops in seconds rather than timing out row by row; the
 * GitHub runner the nightly import uses can, through
 * .github/workflows/recheck-brazil-amounts.yml.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { fetchPncpItems } from "../lib/ingestion/connectors/brazil-pncp-live";
import { sumPncpItemValues, type PncpItem } from "../lib/ingestion/brazil-pncp-mapper";
import { BRAZIL_PNCP_SOURCE_NAME } from "../lib/relevance-pncp-pregao";
import { classifyStoredTender } from "../lib/relevance";
import { convertToUsd } from "../lib/currency";
import type { TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const PACE_MS = 500;
const FAILURE_STREAK = 12;
const write = process.argv.includes("--write");
const hoursIndex = process.argv.indexOf("--hours");
const HOURS = hoursIndex >= 0 && Number(process.argv[hoursIndex + 1]) > 0 ? Number(process.argv[hoursIndex + 1]) : 36;
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Row = {
  id: string;
  slug: string;
  tender_number: string;
  title: { es?: string; zh?: string } | null;
  summary: { es?: string } | null;
  buyer: string;
  procedure_type: string | null;
  government_level: string;
  scope_type: string;
  structured_duration_days: number | null;
  relevance_tier: TenderRelevanceTier | null;
  manual_field_overrides: string[] | null;
};

type Outcome =
  | { kind: "delete"; row: Row; value: number; reason: string }
  | { kind: "keep"; row: Row; value: number; tier: TenderRelevanceTier; label: unknown; reason: unknown }
  | { kind: "no-amount"; row: Row }
  | { kind: "refused"; row: Row };

/** numero_controle_pncp "<cnpj>-1-<sequencial>/<ano>" → the import's item_url shape. */
function itemUrlOf(tenderNumber: string): string | undefined {
  const match = tenderNumber.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  return match ? `/compras/${match[1]}/${match[3]}/${Number(match[2])}` : undefined;
}

const titleOf = (row: Row) => (row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 56);
const usdText = (brl: number) => `R$ ${Math.round(brl).toLocaleString("en-US")}（约 US$${((convertToUsd(brl, "BRL") ?? 0) / 1e6).toFixed(2)}M）`;

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const since = new Date(Date.now() - HOURS * 3600_000).toISOString();
  const candidates: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, slug, tender_number, title, summary, buyer, procedure_type, government_level, scope_type, structured_duration_days, relevance_tier, manual_field_overrides")
      .eq("source_name", BRAZIL_PNCP_SOURCE_NAME)
      .gte("created_at", since)
      .is("estimated_value", null)
      .is("one_line_summary", null)
      .or("relevance_manually_overridden.is.null,relevance_manually_overridden.eq.false")
      .neq("relevance_tier", "excluded")
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("读取 tenders 失败：" + error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    candidates.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  // Never analysed: no analysed document either.
  const analysed = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const ids = candidates.slice(i, i + 200).map((row) => row.id);
    const { data, error } = await supabase.from("tender_documents").select("tender_id").in("tender_id", ids).eq("extraction_status", "extracted");
    if (error) {
      console.error("读取 tender_documents 失败：" + error.message);
      process.exit(1);
    }
    for (const doc of data ?? []) analysed.add(doc.tender_id as string);
  }
  const rows = candidates.filter((row) => !analysed.has(row.id) && !(row.manual_field_overrides ?? []).includes("estimated_value"));
  console.log(`巴西 PNCP、最近 ${HOURS} 小时入库、没有金额、未锁定、未分析的项目：${rows.length} 条（另有 ${candidates.length - rows.length} 条做过分析或金额是你填的，不动）。`);
  if (rows.length === 0) return;

  // Can this machine reach PNCP at all? Asked of the modality list, which
  // answers in seconds, not of the items endpoint: that one routinely takes
  // tens of seconds when PNCP is busy, and a 20 s probe against it failed on
  // the GitHub runner the nightly import itself uses (2026-10-11). Slowness
  // is the row loop's problem (its refusal streak), not the probe's.
  try {
    const response = await fetch("https://pncp.gov.br/api/pncp/v1/modalidades?statusAtivo=true", { signal: AbortSignal.timeout(30_000) });
    console.log(`连通检查：PNCP 回应 HTTP ${response.status}。`);
  } catch (err) {
    console.error(`连通检查失败：这台电脑连不上 PNCP（${err instanceof Error ? err.message : String(err)}）。`);
    console.error("请改在 GitHub 上跑：Actions → Recheck Brazil amounts → Run workflow（write 先不勾，看完预览再勾）。");
    process.exit(1);
  }
  console.log(`逐条向 PNCP 重新取金额（每条间隔 ${PACE_MS}ms），每条都会打印结果…\n`);

  const outcomes: Outcome[] = [];
  let streak = 0;
  let stopped = false;
  for (const [index, row] of rows.entries()) {
    if (stopped) {
      outcomes.push({ kind: "refused", row });
      continue;
    }
    if (index > 0) await sleep(PACE_MS);
    let refused = false;
    const items: PncpItem[] | null = await fetchPncpItems(itemUrlOf(row.tender_number), () => {
      refused = true;
    });
    const n = `${String(index + 1).padStart(3)}/${rows.length}`;
    if (refused || items === null) {
      outcomes.push({ kind: "refused", row });
      console.log(`  ${n}  PNCP 拒绝     ${titleOf(row)}`);
      streak += 1;
      if (streak >= FAILURE_STREAK) {
        stopped = true;
        console.log(`  连续 ${streak} 条被 PNCP 拒绝，停在第 ${index + 1} / ${rows.length} 条。剩下的不动，过一会儿再跑一次。`);
      }
      continue;
    }
    streak = 0;
    const { value } = sumPncpItemValues(items);
    if (value === undefined) {
      outcomes.push({ kind: "no-amount", row });
      console.log(`  ${n}  本身无金额   ${titleOf(row)}`);
    } else {
      const { relevance } = classifyStoredTender({
        title: row.title?.es ?? "",
        summary: row.summary?.es ?? row.title?.es ?? "",
        buyer: row.buyer,
        country: "Brazil",
        procedureType: row.procedure_type ?? undefined,
        tenderNumber: row.tender_number,
        governmentLevel: row.government_level as Parameters<typeof classifyStoredTender>[0]["governmentLevel"],
        scopeType: row.scope_type as Parameters<typeof classifyStoredTender>[0]["scopeType"],
        estimatedValue: value,
        currency: "BRL",
        sourceName: BRAZIL_PNCP_SOURCE_NAME,
        structuredDurationDays: row.structured_duration_days ?? undefined,
      });
      outcomes.push(
        relevance.tier === "excluded"
          ? { kind: "delete", row, value, reason: relevance.reason.zh }
          : { kind: "keep", row, value, tier: relevance.tier, label: relevance.label, reason: relevance.reason },
      );
      console.log(`  ${n}  ${relevance.tier === "excluded" ? "删除" : `保留·${TIER_ZH[relevance.tier]}`}  ${usdText(value)}  ${titleOf(row)}`);
    }
  }

  const of = <K extends Outcome["kind"]>(kind: K) => outcomes.filter((o): o is Extract<Outcome, { kind: K }> => o.kind === kind);
  const toDelete = of("delete");
  const toKeep = of("keep");
  console.log(`\n取到金额：${toDelete.length + toKeep.length} 条 → 按规则应排除 ${toDelete.length} 条（会删除），有价值保留 ${toKeep.length} 条（补金额、更新规模）。`);
  console.log(`PNCP 回答了但本身没有金额（预算保密/没有明细）：${of("no-amount").length} 条，不动。`);
  console.log(`PNCP 拒绝、没问到：${of("refused").length} 条，不动，之后再跑一次。\n`);

  if (toKeep.length) {
    console.log("==== 保留（有价值）====");
    for (const o of toKeep) console.log(`  ${TIER_ZH[o.tier].padEnd(3)} ${usdText(o.value).padEnd(34)} ${titleOf(o.row)}`);
    console.log("");
  }
  if (toDelete.length) {
    console.log("==== 删除（按金额应排除）====");
    const reasons = new Map<string, number>();
    for (const o of toDelete) reasons.set(o.reason.slice(0, 60), (reasons.get(o.reason.slice(0, 60)) ?? 0) + 1);
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${reason}…`);
    console.log("");
    for (const o of toDelete) console.log(`  ${usdText(o.value).padEnd(34)} ${titleOf(o.row)}`);
    console.log("");
  }

  if (!write) {
    console.log("预览，没有写入。确认无误后执行：npm run recheck:brazil-amounts -- --write");
    return;
  }

  let deleted = 0;
  let updated = 0;
  let failed = 0;
  for (const o of toDelete) {
    const { error } = await supabase.from("tenders").delete().eq("id", o.row.id);
    if (error) {
      failed += 1;
      console.error(`  ${o.row.slug} 删除失败：${error.message}`);
    } else deleted += 1;
  }
  for (const o of toKeep) {
    const { error } = await supabase
      .from("tenders")
      .update({ estimated_value: o.value, currency: "BRL", relevance_tier: o.tier, relevance_label: o.label, relevance_reason: o.reason })
      .eq("id", o.row.id);
    if (error) {
      failed += 1;
      console.error(`  ${o.row.slug} 更新失败：${error.message}`);
    } else updated += 1;
  }
  console.log(`已删除 ${deleted} 条，已补金额并更新规模 ${updated} 条${failed ? `，失败 ${failed} 条` : ""}。前台列表约 5 分钟后刷新。`);
}

main();
