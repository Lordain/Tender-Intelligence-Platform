/**
 * Which rows arrived in the last N hours, and from where — read-only.
 *
 * User, 2026-10-11: 今天一口气导了198个项目进来，太夸张了帮我看看哪里有问题 /
 * 然后也导了一个日期很早的. 最近24小时导入 in 项目管理 counts created_at, the
 * first time a row was written, so this groups exactly those rows: by source,
 * country, tier and why the classifier kept them, and lists the ones
 * published more than a week before they were imported.
 *
 *   npm run audit:recent-imports                 (last 24 hours)
 *   npm run audit:recent-imports -- --hours 48
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import type { TenderRelevanceTier } from "../types/tender";

const PAGE_SIZE = 1000;
const hoursIndex = process.argv.indexOf("--hours");
const HOURS = hoursIndex >= 0 && Number(process.argv[hoursIndex + 1]) > 0 ? Number(process.argv[hoursIndex + 1]) : 24;
const TIER_ZH: Record<TenderRelevanceTier, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "已过滤" };

type Row = {
  slug: string;
  tender_number: string;
  title: { es?: string; zh?: string } | null;
  country: string;
  source_name: string;
  procedure_type: string | null;
  estimated_value: number | null;
  currency: string | null;
  publication_date: string;
  created_at: string;
  relevance_tier: TenderRelevanceTier | null;
  relevance_reason: { zh?: string } | null;
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

  const since = new Date(Date.now() - HOURS * 3600_000).toISOString();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, country, source_name, procedure_type, estimated_value, currency, publication_date, created_at, relevance_tier, relevance_reason")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("读取 tenders 失败：" + error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  console.log(`最近 ${HOURS} 小时新入库 ${rows.length} 条（按第一次写入时间，北京时间 ${new Date(since).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 之后）。\n`);
  const section = (title: string, entries: [string, number][]) => {
    console.log(`==== ${title} ====`);
    for (const [key, count] of entries) console.log(`  ${String(count).padStart(5)}  ${key}`);
    console.log("");
  };
  section("按数据来源", tally(rows, (row) => row.source_name));
  section("按国家", tally(rows, (row) => row.country));
  section("按规模", tally(rows, (row) => TIER_ZH[row.relevance_tier ?? "standard"]));
  section("按入库时间（北京时间，每小时）", tally(rows, (row) => new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit" }) + " 时").sort((a, b) => a[0].localeCompare(b[0])));
  section("保留原因（前 15）", tally(rows, (row) => (row.relevance_reason?.zh ?? "(无)").slice(0, 70)).slice(0, 15));

  const weekMs = 7 * 24 * 3600_000;
  const old = rows.filter((row) => Date.parse(row.created_at) - Date.parse(row.publication_date) > weekMs);
  console.log(`==== 发布日期比入库早 7 天以上的：${old.length} 条（按来源）====`);
  for (const [source, count] of tally(old, (row) => row.source_name)) console.log(`  ${String(count).padStart(5)}  ${source}`);
  console.log("");

  console.log("==== 每个来源的样本（最多 8 条）====");
  for (const [source] of tally(rows, (row) => row.source_name)) {
    console.log(`  [${source}]`);
    for (const row of rows.filter((item) => item.source_name === source).slice(0, 8)) {
      const amount = row.estimated_value === null ? "无金额" : `${row.estimated_value.toLocaleString("en-US")} ${row.currency ?? ""}`;
      console.log(`    发布 ${row.publication_date.slice(0, 10)}  ${TIER_ZH[row.relevance_tier ?? "standard"]}  ${amount.padEnd(22)} ${row.tender_number.padEnd(28)} ${(row.title?.es || row.title?.zh || "").replace(/\s+/g, " ").slice(0, 60)}`);
    }
  }
}

main();
