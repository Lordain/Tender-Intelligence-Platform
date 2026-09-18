/**
 * What the tier bands actually contain, in dollars.
 *
 * Written 2026-09-18 because "should the 大型 floor move?" is not a question
 * the code can answer. FLAGSHIP_VALUE_USD is $6,000,000 and the Arequipa
 * substation contract at $6,929,314 clears it, so the rule is working as
 * specified — whether $6M is the right line depends on what the rest of the
 * feed looks like at that line, and that is a fact about the data.
 *
 * It is also the wrong moment to answer it from the CURRENT tiers: the same
 * day's narrowing (a disclosed amount now beats an industry keyword) moves a
 * large part of 中型 down to 常规, so the stored tiers are about to be stale.
 * Everything below is therefore recomputed from the stored fields through
 * classifyStoredTender() — the same function the ingest and `reclassify:tenders`
 * use — and the stored tier is shown beside it as the migration.
 *
 * Read-only. `npm run reclassify:tenders -- --write` is what actually applies
 * the recomputed tiers.
 *
 *   npm run audit:tier-distribution
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { classifyStoredTender } from "../lib/relevance";
import { convertToUsd } from "../lib/currency";
import type { TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const TIERS: TenderRelevanceTier[] = ["flagship", "significant", "standard", "excluded"];
const TIER_ZH: Record<TenderRelevanceTier, string> = {
  flagship: "大型",
  significant: "中型",
  standard: "常规",
  excluded: "已过滤",
};

/** Candidate 大型 floors to price out, alongside the current $6M. */
const CANDIDATE_FLAGSHIP_FLOORS = [6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000];

type Row = {
  slug: string;
  title: { es?: string; zh?: string } | null;
  summary: { es?: string; zh?: string } | null;
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
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[index];
}

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

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
        "slug, title, summary, buyer, country, procedure_type, government_level, scope_type, estimated_value, currency, source_name, structured_duration_days, relevance_tier, relevance_manually_overridden",
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

  type Scored = { row: Row; stored: TenderRelevanceTier; now: TenderRelevanceTier; usd: number | null };
  const scored: Scored[] = [];
  let protectedCount = 0;

  for (const row of rows) {
    if (row.relevance_manually_overridden === true) {
      // Left out of every number below. A hand-locked tier says what an admin
      // decided, not what the rules produce, and mixing the two is how a
      // threshold gets tuned against its own manual corrections.
      protectedCount += 1;
      continue;
    }
    const { relevance } = classifyStoredTender({
      title: row.title?.es ?? "",
      summary: row.summary?.es ?? "",
      buyer: row.buyer,
      country: row.country,
      procedureType: row.procedure_type ?? undefined,
      governmentLevel: row.government_level as Parameters<typeof classifyStoredTender>[0]["governmentLevel"],
      scopeType: row.scope_type as Parameters<typeof classifyStoredTender>[0]["scopeType"],
      estimatedValue: row.estimated_value ?? undefined,
      currency: row.currency ?? undefined,
      sourceName: row.source_name,
      structuredDurationDays: row.structured_duration_days ?? undefined,
    });
    scored.push({
      row,
      stored: row.relevance_tier ?? "standard",
      now: relevance.tier,
      usd: row.estimated_value === null ? null : convertToUsd(row.estimated_value, row.currency ?? undefined),
    });
  }

  console.log(`${rows.length} 条项目（其中 ${protectedCount} 条人工锁定，已排除在统计外）。\n`);

  console.log("== 分级迁移（存的 -> 按当前规则重算）==");
  console.log("           " + TIERS.map((t) => TIER_ZH[t].padStart(8)).join("") + "     合计");
  for (const stored of TIERS) {
    const fromRows = scored.filter((s) => s.stored === stored);
    const cells = TIERS.map((now) => String(fromRows.filter((s) => s.now === now).length).padStart(8));
    console.log(`  ${TIER_ZH[stored].padEnd(9)}` + cells.join("") + String(fromRows.length).padStart(10));
  }

  console.log("\n== 重算后每一级的金额分布 ==");
  for (const tier of TIERS) {
    const group = scored.filter((s) => s.now === tier);
    const values = group.map((s) => s.usd).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const noValue = group.length - values.length;
    if (group.length === 0) continue;
    console.log(
      `  ${TIER_ZH[tier].padEnd(5)} ${String(group.length).padStart(5)} 条` +
        `（${noValue} 条无金额）` +
        (values.length > 0
          ? `  最小 ${money(values[0])}  中位 ${money(quantile(values, 0.5))}  75分位 ${money(quantile(values, 0.75))}  最大 ${money(values[values.length - 1])}`
          : ""),
    );
  }

  console.log("\n== 大型门槛定在不同位置，会有多少条是「大型」==");
  console.log(`  （只数“靠金额进大型”的那些；关键词类大型项目不受门槛影响，不在这张表里）`);
  const withValue = scored.map((s) => s.usd).filter((v): v is number => v !== null);
  for (const floor of CANDIDATE_FLAGSHIP_FLOORS) {
    const count = withValue.filter((v) => v >= floor).length;
    const current = floor === 6_000_000 ? "   <- 现在" : "";
    console.log(`  ${money(floor).padStart(12)}  ${String(count).padStart(5)} 条${current}`);
  }

  console.log("\n== 重算后 大型 里金额最大的 15 条 ==");
  for (const s of scored
    .filter((item) => item.now === "flagship")
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
    .slice(0, 15)) {
    const title = (s.row.title?.zh || s.row.title?.es || "").replace(/\s+/g, " ").slice(0, 44);
    console.log(`  ${(s.usd === null ? "无金额" : money(s.usd)).padStart(14)}  ${s.row.country.padEnd(9)} ${title}`);
  }

  console.log(
    "\n把「分级迁移」和「大型门槛」这两张表发我。" +
      "\n改完规则后，用 npm run reclassify:tenders 先试运行、再 -- --write 落库。",
  );
}

main();
