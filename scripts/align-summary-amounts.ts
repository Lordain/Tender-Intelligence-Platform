/**
 * Apply the 一句话总结 rule (lib/ingestion/summary-adjustment.ts) to every
 * stored tender that has a summary — the one-off catch-up for rows analysed
 * before the rule existed. Document analysis applies the same rule by itself
 * from now on.
 *
 * User, 2026-10-10: 一句话总结里面提到的项目预算金额 vs 我自己手动填写的预算金额，
 * 如果有差异，把我的替换成一句话总结的金额+规模调整 / 也要比较我改的金额 /
 * 超长期项目（2年）最少中型，3年调整成大项目 / 不要基于总结把标书直接屏蔽.
 *
 * What --write changes is exactly what the rule's plan says: an amount you
 * typed that the summary corrects, an empty amount (only with
 * --include-empty), and the tier — re-tiered on a new amount, or the
 * long-contract floor. Never a source amount, never a locked tier, never to
 * 已过滤. Industry tags, the summary and every other field are untouched.
 *
 *   npm run align:summary-amounts                                (preview)
 *   npm run align:summary-amounts -- --write                     (apply)
 *   npm run align:summary-amounts -- --write --include-empty     (also fill blanks)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { convertToUsd } from "../lib/currency";
import {
  planSummaryAdjustment,
  summaryAdjustmentPatch,
  SUMMARY_ADJUSTMENT_COLUMNS,
  type SummaryAdjustmentPlan,
  type SummaryAdjustmentRow,
} from "../lib/ingestion/summary-adjustment";
import type { TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const write = process.argv.includes("--write");
const includeEmpty = process.argv.includes("--include-empty");
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

type Planned = { row: SummaryAdjustmentRow; plan: SummaryAdjustmentPlan };

const usd = (value: number | null | undefined, currency: string | null | undefined) =>
  value === null || value === undefined ? null : convertToUsd(value, currency ?? undefined);
const fmtUsd = (value: number | null) => (value === null ? "无" : `$${(value / 1_000_000).toFixed(2)}M`);
const fmtRaw = (value: number | null | undefined, currency: string | null | undefined) =>
  value === null || value === undefined ? "无金额" : `${value.toLocaleString("en-US")} ${currency ?? "?"}`;
const titleOf = (row: SummaryAdjustmentRow) => (row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 50);

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: SummaryAdjustmentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(SUMMARY_ADJUSTMENT_COLUMNS)
      .not("one_line_summary", "is", null)
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("读取 tenders 失败：" + error.message);
      process.exit(1);
    }
    const page = (data ?? []) as unknown as SummaryAdjustmentRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const planned: Planned[] = rows.map((row) => ({ row, plan: planSummaryAdjustment(row, { fillEmpty: includeEmpty }) }));
  const byCase = (amountCase: SummaryAdjustmentPlan["amountCase"]) => planned.filter((item) => item.plan.amountCase === amountCase);
  const replace = byCase("replace");
  const typedSuspicious = byCase("typed-suspicious");
  const sourceMismatch = byCase("source-mismatch");
  const fill = byCase("fill");
  const ambiguous = byCase("ambiguous");
  const lengthen = planned.filter((item) => !item.plan.newAmount && item.plan.tierTo !== item.plan.tierFrom);
  const lockedLong = planned.filter((item) => !item.plan.newAmount && item.plan.tierNote?.startsWith("人工锁定，分级不动（长期合同")).length;

  console.log(
    `有一句话总结的项目 ${rows.length} 条：总结里没写金额 ${byCase("none").length} 条，金额一致（差 ≤5%）${byCase("same").length} 条，总结里有多个金额/看不准 ${ambiguous.length} 条${byCase("unconvertible").length ? `，币种无法换算 ${byCase("unconvertible").length} 条` : ""}。`,
  );
  console.log(`你改过的金额与总结不一致：会替换 ${replace.length} 条，差异可疑不替换 ${typedSuspicious.length} 条。`);
  console.log(`源头系统的金额与总结不一致（以源头为准，不改）：${sourceMismatch.length} 条。`);
  console.log(`库里没有金额、总结里有：${fill.length} 条（${includeEmpty ? "会补上" : "只列出，加 --include-empty 才补"}）。`);
  console.log(`金额不变、但总结写明长期合同（2 年以上至少中型，3 年以上大型）要上调规模 ${lengthen.length} 条${lockedLong ? `（另有人工锁定 ${lockedLong} 条，不动）` : ""}。\n`);

  const printAmount = ({ row, plan }: Planned) => {
    const amount = plan.summaryAmount!;
    const storedUsd = usd(row.estimated_value, row.currency);
    const newUsd = usd(amount.value, amount.currency);
    const ratio = storedUsd && newUsd ? `  (×${(newUsd / storedUsd).toFixed(2)})` : "";
    const tier = plan.tierTo !== plan.tierFrom ? `${TIER_ZH[plan.tierFrom]}→${TIER_ZH[plan.tierTo]}` : TIER_ZH[plan.tierFrom];
    console.log(`  ${row.country.padEnd(10)} ${titleOf(row)}`);
    console.log(`    现在 ${fmtRaw(row.estimated_value, row.currency)} (${fmtUsd(storedUsd)})  →  总结 ${fmtRaw(amount.value, amount.currency)} (${fmtUsd(newUsd)})${ratio}   规模 ${tier}${plan.tierNote ? `  [${plan.tierNote}]` : ""}`);
    console.log(`    总结：${row.one_line_summary}`);
    console.log(`    ${row.slug}`);
  };
  const section = (title: string, items: Planned[], print: (item: Planned) => void) => {
    if (items.length === 0) return;
    console.log(`==== ${title} ====`);
    items.forEach(print);
    console.log("");
  };

  section("你改过的金额与总结不一致，会替换成总结里的金额", replace, printAmount);
  section("你改过的金额与总结不一致，但币种不同或相差 5 倍以上 —— 更像总结写错，不替换（请人工看）", typedSuspicious, printAmount);
  section("源头系统的金额与总结不一致 —— 以源头为准，金额不改（只列出）", sourceMismatch, printAmount);
  section(`库里没有金额，总结里有（${includeEmpty ? "会补上" : "只列出"}）`, fill, printAmount);
  section("长期合同，规模上调（金额不动）", lengthen, ({ row, plan }) => {
    console.log(`  ${row.country.padEnd(10)} ${titleOf(row)}  ${TIER_ZH[plan.tierFrom]}→${TIER_ZH[plan.tierTo]}  金额 ${fmtRaw(row.estimated_value, row.currency)}`);
    console.log(`    总结：${row.one_line_summary}`);
    console.log(`    ${row.slug}`);
  });
  section("总结里有多个金额或看不准，金额不动（请人工看）", ambiguous, ({ row, plan }) => {
    console.log(`  ${row.country.padEnd(10)} ${titleOf(row)}  现在 ${fmtRaw(row.estimated_value, row.currency)}`);
    console.log(`    总结：${row.one_line_summary}`);
    if (plan.ambiguousAmounts?.length) console.log(`    读到的金额：${plan.ambiguousAmounts.map((amount) => fmtRaw(amount.value, amount.currency)).join(" / ")}`);
    console.log(`    ${row.slug}`);
  });

  if (!write) {
    console.log(`预览，没有写入。确认无误后执行：npm run align:summary-amounts -- --write${fill.length > 0 && !includeEmpty ? "（要同时补上空金额，再加 --include-empty）" : ""}`);
    return;
  }

  let amounts = 0;
  let tiers = 0;
  let failed = 0;
  for (const { row, plan } of planned) {
    const patch = summaryAdjustmentPatch(plan);
    if (!patch) continue;
    const { error } = await supabase.from("tenders").update(patch).eq("slug", row.slug);
    if (error) {
      failed += 1;
      console.error(`  ${row.slug} 更新失败：${error.message}`);
      continue;
    }
    if (plan.newAmount) amounts += 1;
    if (plan.tierTo !== plan.tierFrom) tiers += 1;
  }
  console.log(`\n已更新金额 ${amounts} 条，规模 ${tiers} 条${failed ? `，${failed} 条失败` : ""}。没有任何项目被排除；行业标签、一句话总结和其他字段没有改动。`);
}

main();
