/**
 * How many stored tenders are below a given amount (default US$300,000), and
 * what they are.
 *
 * User, 2026-10-11: 帮我分析当前有多少300,000以下的项目在库里？ Amounts are
 * compared in USD through convertToUsd (lib/currency.ts), the same conversion
 * the tiers use. Rows without an amount, or in a currency with no rate, are
 * counted separately — they are not "small", they are unknown.
 *
 * Same day: 可以的话，我想清理掉. With --write, every row below the amount is
 * deleted the way the admin list deletes one — the row goes and its slug is
 * tombstoned in tender_manual_deletions, so the next import does not bring
 * it back. EXCEPT a row whose tier an admin locked (relevance_manually_
 * overridden): that was a deliberate decision to keep it, so it is listed and
 * left alone unless --include-locked. Rows with no amount are never touched.
 * Related rows (requirements, risks, documents, key dates, status history)
 * go with it through their ON DELETE CASCADE, as with any admin delete.
 *
 *   npm run audit:small-tenders                          (preview)
 *   npm run audit:small-tenders -- --max 500000          (another threshold)
 *   npm run audit:small-tenders -- --write               (delete, locked rows kept)
 *   npm run audit:small-tenders -- --write --include-locked
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { convertToUsd } from "../lib/currency";
import { isClosedTender } from "../lib/access-control";
import type { TenderRelevanceTier, TenderStatus } from "../types/tender";

const PAGE_SIZE = 1000;
const maxIndex = process.argv.indexOf("--max");
const MAX_USD = maxIndex >= 0 && Number(process.argv[maxIndex + 1]) > 0 ? Number(process.argv[maxIndex + 1]) : 300_000;
const write = process.argv.includes("--write");
const includeLocked = process.argv.includes("--include-locked");
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

type Row = {
  slug: string;
  tender_number: string;
  title: { es?: string; zh?: string } | null;
  country: string;
  status: TenderStatus;
  industries: string[] | null;
  source_name: string;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
  one_line_summary: string | null;
};

function tally<T>(rows: T[], key: (row: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

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
      .select("slug, tender_number, title, country, status, industries, source_name, estimated_value, currency, relevance_tier, relevance_manually_overridden, one_line_summary")
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

  const usdOf = (row: Row) => (row.estimated_value === null ? null : convertToUsd(row.estimated_value, row.currency ?? undefined));
  const noAmount = rows.filter((row) => row.estimated_value === null);
  const noRate = rows.filter((row) => row.estimated_value !== null && usdOf(row) === null);
  const small = rows.filter((row) => {
    const usd = usdOf(row);
    return usd !== null && usd < MAX_USD;
  });
  const shown = small.filter((row) => row.relevance_tier !== "excluded");
  const live = shown.filter((row) => !isClosedTender(row.status));
  const limit = `$${MAX_USD.toLocaleString("en-US")}`;

  console.log(`库里共 ${rows.length} 条项目。`);
  console.log(`  有金额、低于 ${limit}：${small.length} 条（${Math.round((small.length / rows.length) * 100)}%）`);
  console.log(`    其中前台可见（未被过滤）：${shown.length} 条；在招（未截止）：${live.length} 条`);
  console.log(`    其中已过滤（前台本来就看不到）：${small.length - shown.length} 条`);
  console.log(`  没有金额：${noAmount.length} 条（不算在内）${noRate.length ? `；币种无法换算：${noRate.length} 条` : ""}\n`);

  const section = (title: string, entries: [string, number][]) => {
    console.log(`==== ${title} ====`);
    for (const [key, count] of entries) console.log(`  ${String(count).padStart(5)}  ${key}`);
    console.log("");
  };
  section(`低于 ${limit}、前台可见的，按规模`, tally(shown, (row) => TIER_ZH[row.relevance_tier ?? "standard"] + (row.relevance_manually_overridden ? "（人工锁定）" : "")));
  section(`低于 ${limit}、前台可见的，按国家`, tally(shown, (row) => row.country));
  section(`低于 ${limit}、前台可见的，按行业（一条可有多个行业）`, tally(shown.flatMap((row) => (row.industries?.length ? row.industries : ["(无)"]).map((industry) => ({ industry }))), (item) => item.industry));
  section(`低于 ${limit}、前台可见的，按数据来源`, tally(shown, (row) => row.source_name));
  console.log(`  其中做过标书分析（有一句话总结）的：${shown.filter((row) => row.one_line_summary?.trim()).length} 条\n`);

  console.log(`==== 低于 ${limit}、前台可见、在招的样本（按金额从小到大，最多 40 条）====`);
  for (const row of [...live].sort((a, b) => (usdOf(a) ?? 0) - (usdOf(b) ?? 0)).slice(0, 40)) {
    const usd = usdOf(row)!;
    console.log(`  $${Math.round(usd).toLocaleString("en-US").padStart(9)}  ${TIER_ZH[row.relevance_tier ?? "standard"]}  ${row.country.padEnd(10)} ${(row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 46)}`);
  }
  const locked = small.filter((row) => row.relevance_manually_overridden === true);
  const toDelete = small.filter((row) => includeLocked || row.relevance_manually_overridden !== true);
  console.log(`\n==== 清理 ====`);
  console.log(`  会删除：${toDelete.length} 条（前台可见 ${toDelete.filter((row) => row.relevance_tier !== "excluded").length} 条，已过滤 ${toDelete.filter((row) => row.relevance_tier === "excluded").length} 条）`);
  if (locked.length > 0) {
    console.log(`  人工锁定过分级的 ${locked.length} 条${includeLocked ? "也会删除（--include-locked）" : "不删，加 --include-locked 才删"}：`);
    for (const row of locked) console.log(`    $${Math.round(usdOf(row)!).toLocaleString("en-US").padStart(9)}  ${row.country.padEnd(10)} ${(row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 46)}  ${row.slug}`);
  }

  if (!write) {
    console.log(`\n预览，没有写入。确认无误后执行：npm run audit:small-tenders -- --write${MAX_USD !== 300_000 ? ` --max ${MAX_USD}` : ""}`);
    return;
  }

  let removed = 0;
  let failed = 0;
  for (const row of toDelete) {
    const { error } = await supabase.from("tenders").delete().eq("slug", row.slug);
    if (error) {
      failed += 1;
      console.error(`  ${row.slug} 删除失败：${error.message}`);
      continue;
    }
    removed += 1;
    const { error: tombstoneError } = await supabase
      .from("tender_manual_deletions")
      .upsert({ slug: row.slug, tender_number: row.tender_number, title: row.title?.es ?? null, deleted_at: new Date().toISOString() }, { onConflict: "slug" });
    if (tombstoneError) console.error(`  ${row.slug} 已删除，但没能记入 tender_manual_deletions：${tombstoneError.message}`);
  }
  console.log(`\n已删除 ${removed} 条低于 ${limit} 的项目${failed ? `，${failed} 条失败` : ""}，并记入手动删除名单，之后的导入不会再写回。`);
}

main();
