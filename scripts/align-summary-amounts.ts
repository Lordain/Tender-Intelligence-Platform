/**
 * Where a tender's 一句话总结 states a budget that differs from the stored
 * estimated amount, take the summary's — and re-tier the row on it.
 *
 * User, 2026-10-10: 请帮我做个批量检查：一句话总结里面提到的项目预算金额 vs
 * 我自己手动填写的预算金额，如果有差异，把我的替换成一句话总结的金额+规模调整.
 * (and, mid-run: 也要比较我改的金额).
 *
 * Which stored amounts may be replaced — decided on the first live preview,
 * where 10 of 14 mismatches were the SUMMARY's mistake, checked against PNCP
 * and SECOP: a unit slip ("1.055 万雷亚尔" for R$ 10,557,230), pesos written
 * as dollars (COP 30,123,714,371 → "3012万美元"), a bidder requirement read as
 * the budget, a model's own BOB→USD conversion. An amount the import took
 * from the source system is exact; the summary is a model's paraphrase of it.
 * So:
 *   - an amount an admin TYPED (estimated_value in manual_field_overrides)
 *     that differs from the summary → replaced, as asked — unless the
 *     currencies differ (the model converted) or the two are more than 5×
 *     apart (a unit slip), which are listed for a human instead;
 *   - an amount from the source that differs → listed only, never written;
 *   - no stored amount → filled only with --include-empty.
 *
 * Reading the amount: lib/ingestion/summary-amount.ts — only a figure with a
 * currency, never a guarantee / experience / asset threshold, and never a
 * summary that names two budgets. Amounts within 5% of each other (the
 * summary rounds: "约60亿比索") count as the same.
 *
 * What --write changes, per row in the 「会替换」 list:
 *   - estimated_value and currency → the summary's, and both are added to
 *     manual_field_overrides so the next import of the source does not put
 *     its own figure back (lib/ingestion/upsert-tenders.ts omitSetFor);
 *   - relevance_tier / label / reason → recomputed on the new amount
 *     (classifyStoredTender, the import's own rule), EXCEPT a row an admin
 *     locked (relevance_manually_overridden) keeps its tier, and a row the
 *     new amount would drop to 已过滤 keeps its tier too — both are listed.
 * Industry tags, the summary itself and every other field are untouched.
 * Rows with NO stored amount are listed separately and only filled with
 * --include-empty.
 *
 * Same day, second rule (一句话总结里面如果识别到超长期项目（2年），就归为最少
 * 中型项目，3年调整成大项目): a contract term the summary states sets a floor
 * on the tier — applySummaryDurationFloor, lib/relevance.ts. Rows whose amount
 * changes get it through classifyStoredTender; every other row gets it on its
 * stored tier, in the 「长期合同，规模上调」 list. Locked rows and 已过滤 rows
 * are never moved.
 *
 *   npm run align:summary-amounts                                (preview)
 *   npm run align:summary-amounts -- --write                     (apply)
 *   npm run align:summary-amounts -- --write --include-empty     (also fill blanks)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { applySummaryDurationFloor, classifyStoredTender } from "../lib/relevance";
import { convertToUsd } from "../lib/currency";
import { amountsInSummary, type SummaryAmount } from "../lib/ingestion/summary-amount";
import type { LocalizedText, TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const TOLERANCE = 0.05;
/** Beyond this ratio either way a mismatch is a unit slip, not a correction. */
const MAX_RATIO = 5;
const write = process.argv.includes("--write");
const includeEmpty = process.argv.includes("--include-empty");
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

type Row = {
  slug: string;
  tender_number: string;
  title: { es?: string; zh?: string } | null;
  summary: { es?: string; zh?: string } | null;
  one_line_summary: string | null;
  buyer: string;
  country: string;
  procedure_type: string | null;
  government_level: string;
  scope_type: string;
  estimated_value: number | null;
  currency: string | null;
  source_name: string;
  structured_duration_days: number | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
  manual_field_overrides: string[] | null;
};

type Change = {
  row: Row;
  amount: SummaryAmount;
  tierFrom: TenderRelevanceTier;
  tierTo: TenderRelevanceTier;
  label: LocalizedText;
  reason: LocalizedText;
  tierNote: string | null;
};

const usd = (value: number | null, currency: string | null) => (value === null ? null : convertToUsd(value, currency ?? undefined));
const fmtUsd = (value: number | null) => (value === null ? "无" : `$${(value / 1_000_000).toFixed(2)}M`);
const fmtRaw = (value: number | null, currency: string | null) => (value === null ? "无金额" : `${value.toLocaleString("en-US")} ${currency ?? "?"}`);
const titleOf = (row: Row) => (row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 50);

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(
        "slug, tender_number, title, summary, one_line_summary, buyer, country, procedure_type, government_level, scope_type, estimated_value, currency, source_name, structured_duration_days, relevance_tier, relevance_manually_overridden, manual_field_overrides",
      )
      .not("one_line_summary", "is", null)
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("读取 tenders 失败：" + error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const replace: Change[] = [];
  const lengthen: { row: Row; tierFrom: TenderRelevanceTier; tierTo: TenderRelevanceTier; label: LocalizedText; reason: LocalizedText }[] = [];
  let lockedLong = 0;
  // A row whose amount stays as it is may still need the long-contract floor.
  const floorOnly = (row: Row) => {
    const tierFrom = row.relevance_tier ?? "standard";
    const floored = applySummaryDurationFloor({ tier: tierFrom, label: { zh: "", en: "", es: "" }, reason: { zh: "", en: "", es: "" } }, row.one_line_summary);
    if (floored.tier === tierFrom) return;
    if (row.relevance_manually_overridden === true) lockedLong += 1;
    else lengthen.push({ row, tierFrom, tierTo: floored.tier, label: floored.label, reason: floored.reason });
  };
  const fill: Change[] = [];
  // Mismatches that are NOT written: the stored amount came from the source,
  // or a typed one disagrees in a way that looks like the summary's mistake.
  const sourceMismatch: Change[] = [];
  const typedSuspicious: Change[] = [];
  const ambiguous: { row: Row; amounts: SummaryAmount[] }[] = [];
  let same = 0;
  let noAmount = 0;
  let unconvertible = 0;

  for (const row of rows) {
    const result = amountsInSummary(row.one_line_summary, row.country);
    if (result.kind === "none") {
      noAmount += 1;
      floorOnly(row);
      continue;
    }
    if (result.kind === "ambiguous") {
      ambiguous.push({ row, amounts: result.amounts });
      floorOnly(row);
      continue;
    }
    const amount = result.amount;
    const summaryUsd = usd(amount.value, amount.currency);
    const storedUsd = usd(row.estimated_value, row.currency);
    if (summaryUsd === null) {
      unconvertible += 1;
      floorOnly(row);
      continue;
    }
    if (storedUsd !== null && Math.abs(summaryUsd - storedUsd) <= storedUsd * TOLERANCE) {
      same += 1;
      floorOnly(row);
      continue;
    }

    const { relevance } = classifyStoredTender({
      title: row.title?.es ?? "",
      summary: row.summary?.es ?? "",
      buyer: row.buyer,
      country: row.country,
      procedureType: row.procedure_type ?? undefined,
      tenderNumber: row.tender_number,
      governmentLevel: row.government_level as Parameters<typeof classifyStoredTender>[0]["governmentLevel"],
      scopeType: row.scope_type as Parameters<typeof classifyStoredTender>[0]["scopeType"],
      estimatedValue: amount.value,
      currency: amount.currency,
      sourceName: row.source_name,
      structuredDurationDays: row.structured_duration_days ?? undefined,
      oneLineSummary: row.one_line_summary,
    });
    const tierFrom = row.relevance_tier ?? "standard";
    let tierTo = relevance.tier;
    let tierNote: string | null = null;
    if (row.relevance_manually_overridden === true) {
      tierNote = tierTo !== tierFrom ? `人工锁定，分级不动（按新金额会是${TIER_ZH[tierTo]}）` : "人工锁定";
      tierTo = tierFrom;
    } else if (tierTo === "excluded" && tierFrom !== "excluded") {
      tierNote = "按新金额会被过滤，分级保持不动";
      tierTo = tierFrom;
    }
    const change = { row, amount, tierFrom, tierTo, label: relevance.label, reason: relevance.reason, tierNote };
    const typedByHand = (row.manual_field_overrides ?? []).includes("estimated_value");
    const ratio = storedUsd ? summaryUsd / storedUsd : null;
    if (row.estimated_value === null) {
      fill.push(change);
      // Filled only with --include-empty; without it the floor still applies.
      if (!includeEmpty) floorOnly(row);
    } else if (!typedByHand) {
      sourceMismatch.push(change);
      floorOnly(row);
    } else if (amount.currency !== row.currency || (ratio !== null && (ratio > MAX_RATIO || ratio < 1 / MAX_RATIO))) {
      typedSuspicious.push(change);
      floorOnly(row);
    } else {
      replace.push(change);
    }
  }

  console.log(`有一句话总结的项目 ${rows.length} 条：总结里没写金额 ${noAmount} 条，金额一致（差 ≤5%）${same} 条，总结里有多个金额/看不准 ${ambiguous.length} 条${unconvertible ? `，币种无法换算 ${unconvertible} 条` : ""}。`);
  console.log(`你改过的金额与总结不一致：会替换 ${replace.length} 条，差异可疑不替换 ${typedSuspicious.length} 条。`);
  console.log(`源头系统的金额与总结不一致（以源头为准，不改）：${sourceMismatch.length} 条。`);
  console.log(`库里没有金额、总结里有：${fill.length} 条（${includeEmpty ? "会补上" : "只列出，加 --include-empty 才补"}）。`);
  console.log(`金额不变、但总结写明长期合同（2 年以上至少中型，3 年以上大型）要上调规模 ${lengthen.length} 条${lockedLong ? `（另有人工锁定 ${lockedLong} 条，不动）` : ""}。\n`);

  const printChange = (change: Change) => {
    const { row, amount } = change;
    const storedUsd = usd(row.estimated_value, row.currency);
    const newUsd = usd(amount.value, amount.currency);
    const ratio = storedUsd && newUsd ? `  (×${(newUsd / storedUsd).toFixed(2)})` : "";
    const tier = change.tierTo !== change.tierFrom ? `${TIER_ZH[change.tierFrom]}→${TIER_ZH[change.tierTo]}` : TIER_ZH[change.tierFrom];
    console.log(`  ${row.country.padEnd(10)} ${titleOf(row)}`);
    console.log(`    现在 ${fmtRaw(row.estimated_value, row.currency)} (${fmtUsd(storedUsd)})  →  总结 ${fmtRaw(amount.value, amount.currency)} (${fmtUsd(newUsd)})${ratio}   规模 ${tier}${change.tierNote ? `  [${change.tierNote}]` : ""}`);
    console.log(`    总结：${row.one_line_summary}`);
    console.log(`    ${row.slug}`);
  };

  if (replace.length > 0) {
    console.log("==== 你改过的金额与总结不一致，会替换成总结里的金额 ====");
    replace.forEach(printChange);
    console.log("");
  }
  if (typedSuspicious.length > 0) {
    console.log(`==== 你改过的金额与总结不一致，但币种不同或相差 ${MAX_RATIO} 倍以上 —— 更像总结写错，不替换（请人工看）====`);
    typedSuspicious.forEach(printChange);
    console.log("");
  }
  if (sourceMismatch.length > 0) {
    console.log("==== 源头系统的金额与总结不一致 —— 以源头为准，不改（只列出）====");
    sourceMismatch.forEach(printChange);
    console.log("");
  }
  if (fill.length > 0) {
    console.log(`==== 库里没有金额，总结里有（${includeEmpty ? "会补上" : "只列出"}）====`);
    fill.forEach(printChange);
    console.log("");
  }
  if (lengthen.length > 0) {
    console.log("==== 长期合同，规模上调（金额不动）====");
    for (const { row, tierFrom, tierTo } of lengthen) {
      console.log(`  ${row.country.padEnd(10)} ${titleOf(row)}  ${TIER_ZH[tierFrom]}→${TIER_ZH[tierTo]}  金额 ${fmtRaw(row.estimated_value, row.currency)}`);
      console.log(`    总结：${row.one_line_summary}`);
      console.log(`    ${row.slug}`);
    }
    console.log("");
  }
  if (ambiguous.length > 0) {
    console.log("==== 总结里有多个金额或看不准，金额不动（请人工看）====");
    for (const { row, amounts } of ambiguous) {
      console.log(`  ${row.country.padEnd(10)} ${titleOf(row)}  现在 ${fmtRaw(row.estimated_value, row.currency)}`);
      console.log(`    总结：${row.one_line_summary}`);
      if (amounts.length > 0) console.log(`    读到的金额：${amounts.map((amount) => fmtRaw(amount.value, amount.currency)).join(" / ")}`);
      console.log(`    ${row.slug}`);
    }
    console.log("");
  }

  const toWrite = includeEmpty ? [...replace, ...fill] : replace;
  if (!write) {
    console.log(`预览，没有写入。确认无误后执行：npm run align:summary-amounts -- --write${fill.length > 0 ? "（要同时补上空金额，再加 --include-empty）" : ""}`);
    return;
  }

  let updated = 0;
  let retiered = 0;
  let failed = 0;
  for (const change of toWrite) {
    const patch: Record<string, unknown> = {
      estimated_value: change.amount.value,
      currency: change.amount.currency,
      manual_field_overrides: [...new Set([...(change.row.manual_field_overrides ?? []), "estimated_value", "currency"])],
    };
    if (change.tierTo !== change.tierFrom) {
      patch.relevance_tier = change.tierTo;
      patch.relevance_label = change.label;
      patch.relevance_reason = change.reason;
    }
    const { error } = await supabase.from("tenders").update(patch).eq("slug", change.row.slug);
    if (error) {
      failed += 1;
      console.error(`  ${change.row.slug} 更新失败：${error.message}`);
      continue;
    }
    updated += 1;
    if (change.tierTo !== change.tierFrom) retiered += 1;
  }
  let lengthened = 0;
  for (const change of lengthen) {
    const { error } = await supabase
      .from("tenders")
      .update({ relevance_tier: change.tierTo, relevance_label: change.label, relevance_reason: change.reason })
      .eq("slug", change.row.slug)
      .eq("relevance_tier", change.tierFrom);
    if (error) {
      failed += 1;
      console.error(`  ${change.row.slug} 规模上调失败：${error.message}`);
      continue;
    }
    lengthened += 1;
  }
  console.log(`\n已更新 ${updated} 条金额，其中 ${retiered} 条规模随之调整；长期合同规模上调 ${lengthened} 条${failed ? `；${failed} 条失败` : ""}。行业标签、一句话总结和其他字段没有改动。`);
}

main();
