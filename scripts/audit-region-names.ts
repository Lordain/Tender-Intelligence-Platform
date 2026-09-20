/**
 * Which live rows name one region in Chinese and a different one in the
 * parenthesis beside it.
 *
 * Written after the user found 阿雷基帕省（Ancash）on a live page
 * (2026-09-20). Arequipa and Áncash are two Peruvian departments a thousand
 * kilometres apart; the project was in Huari, a province OF Áncash. The
 * Chinese and the source spelling disagreed about which region the tender is
 * in, and nothing we had would ever have noticed: both halves are individually
 * well-formed.
 *
 * That parenthesis is not decoration. translate-titles-qwen.ts puts it there
 * so a subscriber can match our title against the bid documents, so a wrong
 * one sends a bidder to the wrong region's portal.
 *
 * READ-ONLY. It prints what to look at; it changes nothing. Fixing a row is a
 * decision per row — the Chinese may be right and the parenthesis wrong, or
 * the other way round, and only the source notice settles it.
 *
 *   npm run audit:region-names
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { findRegionNameMismatches } from "../lib/region-names";

/** Same 1000-row-per-request PostgREST cap every other full-table scan pages around (see lib/db/tenders.ts's SUPABASE_PAGE_SIZE comment). */
const PAGE_SIZE = 1000;

type Row = {
  slug: string;
  country: string | null;
  title: { zh?: string; es?: string } | null;
  summary: { zh?: string } | null;
  title_zh_short: string | null;
};

async function main(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase 未配置（需要 SUPABASE_SERVICE_ROLE_KEY）。");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, country, title, summary, title_zh_short")
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`读取项目失败：${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  let flagged = 0;
  for (const row of rows) {
    // Every field that carries the annotated pair. The short title is checked
    // too because it is what a member now reads in every list row, and it is
    // derived from the full title — so a wrong region there is the same wrong
    // region, in the more visible place.
    const fields: [string, string][] = [
      ["标题", row.title?.zh ?? ""],
      ["短标题", row.title_zh_short ?? ""],
      ["摘要", row.summary?.zh ?? ""],
    ];

    const perField = fields
      .map(([label, text]) => [label, findRegionNameMismatches(text)] as const)
      .filter(([, found]) => found.length > 0);
    if (perField.length === 0) continue;

    flagged += 1;
    console.log(`\n${row.slug}  [${row.country ?? "?"}]`);
    if (row.title?.es) console.log(`  原文：${row.title.es.slice(0, 120)}`);
    for (const [label, found] of perField) {
      for (const mismatch of found) {
        console.log(`  ${label}：「${mismatch.found}」`);
        console.log(`    括号里的 ${mismatch.latin} 对应中文应为「${mismatch.expectedZh}」，实际写的是「${mismatch.actualZh}」`);
      }
    }
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log(`检查了 ${rows.length} 条，发现 ${flagged} 条中文大区名与括号原文不一致。`);
  if (flagged > 0) {
    console.log("逐条对照原文判断该改哪一边：可能是中文译错了大区，也可能是括号里带错了原文。");
    console.log("改完记得清空该行的 title_zh_short / title_zh_public / summary_zh_public，让公开文案重新生成。");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
