/**
 * How much of the feed the "analysis must be logged" visibility rule leaves
 * standing (lib/db/tenders.ts, fetchAllTendersFromDb).
 *
 * Written alongside that rule on 2026-09-18 because the rule's blast radius
 * cannot be reasoned about from the code — it depends entirely on how many
 * tenders have actually been through Layer 2, which is a fact about the
 * database on that day. Run it BEFORE deploying the rule: if the "会显示"
 * number is small, the site is about to look empty, and that is a decision to
 * take on purpose rather than discover from the live site.
 *
 * Read-only.
 *
 *   npm run audit:public-visibility
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const PAGE_SIZE = 1000;

type Row = {
  id: string;
  slug: string;
  country: string | null;
  relevance_tier: string | null;
  status: string;
  source_name: string | null;
};

async function collectIdsWithAnalysis(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const table of ["tender_requirements", "tender_risks"] as const) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase!
        .from(table)
        .select("tender_id")
        .order("tender_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error(`读取 ${table} 失败：${error.message}`);
        process.exit(1);
      }
      const page = (data ?? []) as { tender_id: string | null }[];
      for (const row of page) if (row.tender_id) ids.add(row.tender_id);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return ids;
}

function tally(rows: Row[], key: (row: Row) => string): [string, number][] {
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
      .select("id, slug, country, relevance_tier, status, source_name")
      .neq("relevance_tier", "excluded")
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

  const withAnalysis = await collectIdsWithAnalysis(supabase);
  const visible = rows.filter((row) => withAnalysis.has(row.id));
  const hidden = rows.filter((row) => !withAnalysis.has(row.id));
  const pct = rows.length === 0 ? 0 : Math.round((visible.length / rows.length) * 100);

  console.log(`未被规则过滤掉的项目（relevance_tier != excluded）共 ${rows.length} 条。\n`);
  console.log(`  有标书分析结果，会显示：${visible.length} 条（${pct}%）`);
  console.log(`  没有分析结果，会隐藏：${hidden.length} 条\n`);

  for (const [label, group] of [["会显示", visible], ["会隐藏", hidden]] as const) {
    console.log(`${label} — 按国家：` + tally(group, (row) => row.country ?? "?").map(([k, n]) => `${k} ${n}`).join("、"));
    console.log(`${label} — 按等级：` + tally(group, (row) => row.relevance_tier ?? "?").map(([k, n]) => `${k} ${n}`).join("、"));
  }

  console.log("\n隐藏得最多的来源（这就是该优先跑分析的队列）：");
  for (const [source, count] of tally(hidden, (row) => row.source_name ?? "(no source)").slice(0, 10)) {
    console.log(`  ${String(count).padStart(5)}  ${source}`);
  }

  if (pct < 30) {
    console.log(
      `\n注意：规则生效后前台只剩 ${pct}%。` +
        "\n如果这个比例太低，先去 /admin/documents-needed 批量下载并分析标书，把队列做下去，再上这条规则。",
    );
  }
}

main();
