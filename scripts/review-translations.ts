/**
 * Read a batch of machine translations against their Spanish originals.
 *
 * The site cannot answer this question. It shows the Chinese title alone, and
 * a mistranslation only looks wrong next to the source it came from — a
 * fluent Chinese title for the wrong scope reads perfectly well on its own.
 * So "go and look at the site" was never a real review; this is.
 *
 * Takes the same --slug flags reset-translations.ts takes, so the slug list
 * translate-tenders.ts prints after a --write run can be read with one
 * command and undone with the other.
 *
 * Read-only: selects and prints, writes nothing to Supabase.
 *
 * Usage:
 *   npm run review:translations                                (the first 20 translated rows)
 *   npm run review:translations -- --limit 50
 *   npm run review:translations -- --slug X --slug Y
 *   npm run review:translations -- --slug X --csv              (exports/ instead of the terminal)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { toCsv, writeReviewCsv } from "../lib/ingestion/review-csv";
import { findDroppedIdentifiers, findUntranslatedSpanish } from "../lib/ingestion/translate-titles";
import type { LocalizedText } from "../types/tender";

type Row = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  source_name: string | null;
  manual_field_overrides: string[] | null;
};

const hand = (row: Row, field: string) => (row.manual_field_overrides ?? []).includes(field);
const machineTitle = (row: Row) => row.title.zh !== row.title.es && !hand(row, "title");
const machineSummary = (row: Row) => row.summary.zh !== row.summary.es && !hand(row, "summary");

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function slugArgs(args: string[]): string[] {
  const slugs: string[] = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === "--slug" && args[i + 1]) slugs.push(args[i + 1]);
  return slugs;
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = slugArgs(args);
  const asCsv = args.includes("--csv");
  const limitArg = argValue(args, "--limit");
  const limit = limitArg ? Number(limitArg) : undefined;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Paged for the same reason translate-all-tenders.ts pages: PostgREST caps
  // an unranged select at 1000 and would silently return only the first page.
  const PAGE_SIZE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, summary, source_name, manual_field_overrides")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`读取失败：${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    console.error(`这些 slug 在库里不存在：\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }

  const scoped = slugs.length > 0 ? slugs.map((s) => bySlug.get(s)!) : rows.filter((r) => machineTitle(r) || machineSummary(r));
  const shown = limit !== undefined ? scoped.slice(0, limit) : slugs.length > 0 ? scoped : scoped.slice(0, 20);

  if (shown.length === 0) {
    console.log("没有可看的机器译文。");
    return;
  }

  if (asCsv) {
    const csv = toCsv(
      ["slug", "source_name", "title_es", "title_zh", "summary_es", "summary_zh"],
      shown.map((r) => [r.slug, r.source_name ?? "", r.title.es, r.title.zh, r.summary.es, r.summary.zh]),
    );
    const path = writeReviewCsv({
      dir: "exports",
      baseName: `translations-${new Date().toISOString().slice(0, 10)}`,
      csv,
      label: "review-translations",
    });
    if (path) console.log(`${shown.length} 条已写入 ${path}`);
    return;
  }

  for (const row of shown) {
    console.log(`\n${"─".repeat(78)}\n${row.slug}${row.source_name ? `  (${row.source_name})` : ""}`);
    console.log(`  标题 ES  ${row.title.es}`);
    console.log(`  标题 ZH  ${row.title.zh}${hand(row, "title") ? "   ← 人工编辑，非机器翻译" : ""}`);
    // Most sources publish no separate description, so the summary is a copy
    // of the title. Saying so beats printing the same two lines again.
    if (row.summary.es === row.title.es) {
      console.log(`  摘要      （与标题相同——该源没有独立描述字段）`);
    } else {
      console.log(`  摘要 ES  ${row.summary.es.slice(0, 300)}${row.summary.es.length > 300 ? "…" : ""}`);
      console.log(`  摘要 ZH  ${row.summary.zh.slice(0, 300)}${row.summary.zh.length > 300 ? "…" : ""}${hand(row, "summary") ? "   ← 人工编辑" : ""}`);
    }
  }

  // The two machine-checkable faults, gathered at the end rather than buried
  // per row: a reader scrolling fifty rows will not spot either one, which is
  // the whole reason they are checked at all.
  const codeLosses: string[] = [];
  const spanishLeft: string[] = [];
  for (const row of shown) {
    const codes = findDroppedIdentifiers(`${row.title.zh} ${row.summary.zh}`, `${row.title.es}\n${row.summary.es}`);
    if (codes.length > 0) codeLosses.push(`  ${row.slug}  缺 ${codes.join("、")}`);
    const spanish = findUntranslatedSpanish(row.title.zh);
    if (spanish.length > 0) spanishLeft.push(`  ${row.slug}  ${spanish.join("、")}`);
  }
  if (codeLosses.length > 0) {
    console.log(`\n⚠ ${codeLosses.length} 条丢了原文里的编号：`);
    for (const line of codeLosses) console.log(line);
  }
  if (spanishLeft.length > 0) {
    console.log(`\n⚠ ${spanishLeft.length} 条标题里留着没翻译的西班牙语：`);
    for (const line of spanishLeft) console.log(line);
  }
  if (codeLosses.length > 0 || spanishLeft.length > 0) {
    const bad = [...new Set([...codeLosses, ...spanishLeft].map((l) => l.trim().split(/\s+/)[0]))];
    console.log(`\n  重翻这几条：npm run reset:translations -- --write ${bad.map((s) => `--slug ${s}`).join(" ")}`);
  }

  console.log(`\n${"─".repeat(78)}`);
  console.log(`共 ${shown.length} 条${scoped.length > shown.length ? `（库里还有 ${scoped.length - shown.length} 条，用 --limit 看更多）` : ""}。`);
  console.log(`加 --csv 可以导出成表格，在 Excel 里一次看完。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
