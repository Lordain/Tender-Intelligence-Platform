/**
 * 交通、土建类项目的 大型 / 中型 分布 —— 为调整这两个行业的分级标准取数。
 *
 * Written 2026-10-10 (user: 我想调整交通、土建类项目的大型项目、中型项目标准，
 * 太多大型项目了 / 其他行业不用动). Only rows tagged transportation or
 * construction are counted; every other industry is out of scope.
 *
 * Since 2026-10-10 a transport/works row WITH an amount is tiered by the amount
 * alone (大型 ≥ US$30M, 中型 ≥ US$10M — lib/relevance.ts
 * TRANSPORT_WORKS_FLAGSHIP_VALUE_USD), so the split below mostly shows what is
 * left over: rows with no amount. Before that, such a row reached 大型 in two
 * ways:
 *   1. a disclosed amount ≥ US$10M (FLAGSHIP_VALUE_USD), or
 *   2. a MAJOR_PROJECT_KEYWORDS match — carretera / autopista / puente /
 *      puerto / aeropuerto / ferrocarril / presa … — which promotes to 大型
 *      whatever the amount, even a disclosed $3M; or, with no amount, a
 *      contract running a year or more.
 * The script splits the current 大型 by which of those put it there, then
 * prices out candidate bands for these two industries only.
 *
 * Read-only: nothing is written. Tiers are recomputed from the stored fields
 * through classifyStoredTender(), the function the import itself uses, so the
 * numbers describe what the CURRENT rules produce, not stale stored tiers.
 *
 *   npm run audit:transport-construction-tiers
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { classifyStoredTender } from "../lib/relevance";
import { convertToUsd } from "../lib/currency";
import { isClosedTender } from "../lib/access-control";
import type { TenderRelevanceTier, TenderStatus } from "../types/tender";

const PAGE_SIZE = 1000;
const IN_SCOPE = new Set(["transportation", "construction"]);
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

/** Candidate (大型 floor, 中型 floor) pairs for transport/works, in USD. The first is today's. */
const CANDIDATE_BANDS: [number, number][] = [
  [10_000_000, 5_000_000],
  [20_000_000, 10_000_000],
  [30_000_000, 10_000_000],
  [30_000_000, 15_000_000],
  [50_000_000, 15_000_000],
  [50_000_000, 20_000_000],
];

type Row = {
  slug: string;
  title: { es?: string; zh?: string } | null;
  summary: { es?: string; zh?: string } | null;
  buyer: string;
  country: string;
  status: TenderStatus;
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

type Scored = { row: Row; tier: TenderRelevanceTier; usd: number | null; live: boolean };

const money = (value: number) => `$${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
const pct = (part: number, whole: number) => (whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`);

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
        "slug, tender_number, title, summary, buyer, country, status, procedure_type, government_level, scope_type, estimated_value, currency, source_name, structured_duration_days, relevance_tier, relevance_manually_overridden",
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

  const scored: Scored[] = [];
  let lockedInScope = 0;
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
    if (!industries.some((tag) => IN_SCOPE.has(tag))) continue;
    // A hand-locked tier is what an admin decided, not what the rules
    // produce; tuning a threshold against it would tune against itself.
    if (row.relevance_manually_overridden === true) {
      lockedInScope += 1;
      continue;
    }
    scored.push({
      row,
      tier: relevance.tier,
      usd: row.estimated_value === null ? null : convertToUsd(row.estimated_value, row.currency ?? undefined),
      live: !isClosedTender(row.status),
    });
  }

  for (const [label, group] of [["在招（未截止）", scored.filter((s) => s.live)], ["全部（含已截止）", scored]] as const) {
    const shown = group.filter((s) => s.tier !== "excluded");
    console.log(`\n==== 交通 + 土建，${label}：显示 ${shown.length} 条（人工锁定 ${lockedInScope} 条不计）====`);
    for (const tier of ["flagship", "significant", "standard"] as const) {
      const n = shown.filter((s) => s.tier === tier).length;
      console.log(`  ${TIER_ZH[tier]}  ${String(n).padStart(5)} 条  ${pct(n, shown.length)}`);
    }

    const flagship = shown.filter((s) => s.tier === "flagship");
    const byValue = flagship.filter((s) => s.usd !== null && s.usd >= 10_000_000);
    const keywordWithSmallValue = flagship.filter((s) => s.usd !== null && s.usd < 10_000_000);
    const noValue = flagship.filter((s) => s.usd === null);
    console.log(`\n  大型 ${flagship.length} 条是怎么来的：`);
    console.log(`    金额 ≥ $10M                                ${String(byValue.length).padStart(5)} 条`);
    console.log(`    关键词（公路/桥/港口/机场/铁路/水坝…），金额 < $10M ${String(keywordWithSmallValue.length).padStart(5)} 条`);
    console.log(`    关键词或长工期，没有金额                    ${String(noValue.length).padStart(5)} 条`);

    console.log(`\n  不同标准下的 大型 / 中型 / 常规（只动交通、土建；有金额按金额分，无金额看下方两种处理）：`);
    console.log(`    大型门槛  中型门槛 |  大型  中型  常规 | 无金额关键词项目算大型时的大型数`);
    for (const [flagshipFloor, significantFloor] of CANDIDATE_BANDS) {
      let big = 0, mid = 0, std = 0;
      for (const s of shown) {
        if (s.usd !== null) {
          if (s.usd >= flagshipFloor) big++;
          else if (s.usd >= significantFloor) mid++;
          else std++;
        } else if (s.tier === "flagship") mid++; // no amount: keyword alone capped at 中型
        else if (s.tier === "significant") mid++;
        else std++;
      }
      const ifNoValueStaysBig = big + noValue.length;
      const now = flagshipFloor === 30_000_000 && significantFloor === 10_000_000 ? "  <- 现在的金额门槛（2026-10-10 起）" : flagshipFloor === 10_000_000 && significantFloor === 5_000_000 ? "  <- 之前的全站门槛" : "";
      console.log(
        `    ${money(flagshipFloor).padStart(7)}  ${money(significantFloor).padStart(7)} | ${String(big).padStart(5)} ${String(mid).padStart(5)} ${String(std).padStart(5)} | ${String(ifNoValueStaysBig).padStart(5)}${now}`,
      );
    }
  }

  const liveFlagship = scored.filter((s) => s.live && s.tier === "flagship");
  console.log("\n==== 在招 大型 样本：关键词进大型、金额却不到 $10M 的（按金额从大到小，最多 25 条）====");
  for (const s of liveFlagship
    .filter((item) => item.usd !== null && item.usd < 10_000_000)
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))
    .slice(0, 25)) {
    console.log(`  ${money(s.usd!).padStart(7)}  ${s.row.country.padEnd(10)} ${(s.row.title?.zh || s.row.title?.es || "").replace(/\s+/g, " ").slice(0, 50)}`);
  }
  console.log("\n==== 在招 大型 样本：没有金额的（最多 25 条）====");
  for (const s of liveFlagship.filter((item) => item.usd === null).slice(0, 25)) {
    console.log(`  ${"无金额".padStart(7)}  ${s.row.country.padEnd(10)} ${(s.row.title?.zh || s.row.title?.es || "").replace(/\s+/g, " ").slice(0, 50)}`);
  }

  console.log("\n只读，没有写入任何数据。把上面的输出整段发我。");
}

main();
