/**
 * Apply the 2026-10-10 transport / civil works / water bands to tenders
 * already in the database — and nothing else.
 *
 * User, 2026-10-10: 太多大型项目了 → 有金额时只看金额（大型 ≥ US$30M、
 * 中型 ≥ US$10M）/ 没金额最多算中型 / 水务也一起调整=土建 / 要怎么调整现网的类型？
 *
 * Deliberately narrower than `npm run reclassify:tenders`, which recomputes
 * every industry, rewrites industry tags and deletes rows that have become
 * excluded. This one only:
 *   - looks at rows whose recomputed industries are transportation,
 *     construction and/or water and nothing else (isTransportWorksOnly);
 *   - skips rows an admin locked (relevance_manually_overridden);
 *   - applies a change only when it is a DOWNGRADE among 大型 / 中型 / 常规
 *     (大型→中型, 大型→常规, 中型→常规). An upgrade, or a row that would now be
 *     excluded, is listed and left alone — those come from older rule drift,
 *     not from this change;
 *   - writes relevance_tier / relevance_label / relevance_reason only. Never
 *     industries, never a delete.
 *
 *   npm run retier:transport-works              (preview — writes nothing)
 *   npm run retier:transport-works -- --write   (applies the listed changes)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { classifyStoredTender, isTransportWorksOnly } from "../lib/relevance";
import { convertToUsd } from "../lib/currency";
import type { LocalizedText, TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const RANK: Record<TenderRelevanceTier, number> = { flagship: 3, significant: 2, standard: 1, excluded: 0 };
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

type Row = {
  slug: string;
  title: { es?: string; zh?: string } | null;
  summary: { es?: string; zh?: string } | null;
  buyer: string;
  country: string;
  procedure_type: string | null;
  tender_number: string;
  government_level: string;
  scope_type: string;
  estimated_value: number | null;
  currency: string | null;
  source_name: string;
  structured_duration_days: number | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
};

type Change = { row: Row; from: TenderRelevanceTier; to: TenderRelevanceTier; label: LocalizedText; reason: LocalizedText };

const write = process.argv.includes("--write");

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
        "slug, tender_number, title, summary, buyer, country, procedure_type, government_level, scope_type, estimated_value, currency, source_name, structured_duration_days, relevance_tier, relevance_manually_overridden",
      )
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

  const changes: Change[] = [];
  let inScope = 0;
  let locked = 0;
  let upgradesLeft = 0;
  let wouldExcludeLeft = 0;
  for (const row of rows) {
    const { industries, relevance } = classifyStoredTender({
      title: row.title?.es ?? "",
      summary: row.summary?.es ?? "",
      buyer: row.buyer,
      country: row.country,
      procedureType: row.procedure_type ?? undefined,
      tenderNumber: row.tender_number,
      governmentLevel: row.government_level as Parameters<typeof classifyStoredTender>[0]["governmentLevel"],
      scopeType: row.scope_type as Parameters<typeof classifyStoredTender>[0]["scopeType"],
      estimatedValue: row.estimated_value ?? undefined,
      currency: row.currency ?? undefined,
      sourceName: row.source_name,
      structuredDurationDays: row.structured_duration_days ?? undefined,
    });
    if (!isTransportWorksOnly(industries)) continue;
    inScope += 1;
    if (row.relevance_manually_overridden === true) {
      locked += 1;
      continue;
    }
    const from = row.relevance_tier ?? "standard";
    const to = relevance.tier;
    if (from === to || from === "excluded") continue;
    if (to === "excluded") {
      wouldExcludeLeft += 1;
      continue;
    }
    if (RANK[to] > RANK[from]) {
      upgradesLeft += 1;
      continue;
    }
    changes.push({ row, from, to, label: relevance.label, reason: relevance.reason });
  }

  console.log(`交通 / 土建 / 水务项目共 ${inScope} 条（人工锁定 ${locked} 条，不动）。`);
  const pairs: [TenderRelevanceTier, TenderRelevanceTier][] = [["flagship", "significant"], ["flagship", "standard"], ["significant", "standard"]];
  for (const [from, to] of pairs) {
    console.log(`  ${TIER_ZH[from]} → ${TIER_ZH[to]}：${changes.filter((c) => c.from === from && c.to === to).length} 条`);
  }
  console.log(`  不处理：按现行规则会升级的 ${upgradesLeft} 条、会被过滤的 ${wouldExcludeLeft} 条（不属于这次调整，保持原样）`);

  console.log("\n要调整的项目：");
  for (const c of changes) {
    const usd = c.row.estimated_value === null ? null : convertToUsd(c.row.estimated_value, c.row.currency ?? undefined);
    const amount = usd === null ? "无金额" : `$${(usd / 1_000_000).toFixed(1)}M`;
    const title = (c.row.title?.zh || c.row.title?.es || "").replace(/\s+/g, " ").slice(0, 46);
    console.log(`  ${TIER_ZH[c.from]}→${TIER_ZH[c.to]}  ${amount.padStart(8)}  ${c.row.country.padEnd(10)} ${title}`);
  }

  if (!write) {
    console.log(`\n预览，没有写入。确认无误后加 -- --write 执行：npm run retier:transport-works -- --write`);
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const c of changes) {
    const { error } = await supabase
      .from("tenders")
      .update({ relevance_tier: c.to, relevance_label: c.label, relevance_reason: c.reason })
      .eq("slug", c.row.slug)
      .eq("relevance_tier", c.from);
    if (error) {
      failed += 1;
      console.error(`  ${c.row.slug} 更新失败：${error.message}`);
    } else {
      updated += 1;
    }
  }
  console.log(`\n已更新 ${updated} 条${failed ? `，${failed} 条失败` : ""}。行业标签和其他字段没有改动，没有删除任何项目。`);
}

main();
