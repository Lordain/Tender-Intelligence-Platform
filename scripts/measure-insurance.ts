/**
 * Which stored tenders the insurance rule would have kept out — the
 * measurement asked for before it goes live (user, 2026-10-10: 保险类服务归入
 * 日常服务排除 … 先统计会影响哪些项目).
 *
 * Read-only. Reads every stored tender that is not already 已过滤 and tests
 * its title against INSURANCE_PURCHASE_TITLE (lib/relevance.ts), the same way
 * the classifier does. The rule applies to future imports only; nothing
 * stored is changed, here or later.
 *
 *   npm run measure:insurance
 *
 * Send the console output back.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { INSURANCE_PURCHASE_TITLE } from "../lib/relevance";
import { foldAccents } from "../lib/text-fold";
import { convertToUsd } from "../lib/currency";
import type { LocalizedText, TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const TIER_ZH: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

type Row = {
  slug: string;
  title: LocalizedText | null;
  country: string;
  source_name: string;
  publication_date: string;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
};

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }
  console.log("读取库里未过滤的项目（只读）…");
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, country, source_name, publication_date, estimated_value, currency, relevance_tier, relevance_manually_overridden")
      .or("relevance_tier.is.null,relevance_tier.neq.excluded")
      .order("slug", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`读取 tenders 失败：${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const hits = rows.filter((row) => {
    const title = row.title?.es || row.title?.en || "";
    return INSURANCE_PURCHASE_TITLE.test(foldAccents(title));
  });
  console.log(`\n共 ${rows.length} 个未过滤项目；标题是买保险的 ${hits.length} 个（新规则下以后同类项目会被过滤）：\n`);
  const byCountry = new Map<string, number>();
  for (const row of hits) byCountry.set(row.country, (byCountry.get(row.country) ?? 0) + 1);
  if (byCountry.size > 0) console.log(`按国家：${[...byCountry].sort((a, b) => b[1] - a[1]).map(([country, count]) => `${country} ${count}`).join("、")}\n`);
  for (const row of hits.sort((a, b) => b.publication_date.localeCompare(a.publication_date))) {
    const usd = row.estimated_value ? convertToUsd(row.estimated_value, row.currency ?? undefined) : null;
    const amount = usd ? `US$ ${(usd / 1e6).toFixed(2)}M` : "无金额";
    const locked = row.relevance_manually_overridden ? "（已手动定级）" : "";
    console.log(`  [${TIER_ZH[row.relevance_tier ?? "standard"] ?? row.relevance_tier}${locked}] ${row.country} | ${row.publication_date.slice(0, 10)} | ${amount} | ${(row.title?.es || row.title?.en || "").slice(0, 110)}`);
  }
  console.log("\n只读，未修改任何数据。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
