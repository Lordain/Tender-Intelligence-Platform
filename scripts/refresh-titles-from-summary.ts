/**
 * Re-title stored tenders from their 一句话总结 (user, 2026-10-12: 很多项目的
 * 标题不清晰，用各种缩写 … 包括访客标题、订阅用户标题、正式完整标题).
 * See lib/ingestion/refresh-titles-from-summary.ts.
 *
 * Titles only — no summary is changed (user: 只考虑标题，不要动摘要).
 *
 * Only tenders still taking bids (同「当前在招」) that have a 一句话总结. The
 * full title only gains Chinese notes
 * after its abbreviations; nothing in it is removed. Admin-edited fields are
 * skipped. New analyses do this by themselves; this is for rows analysed
 * before 2026-10-12.
 *
 *   npm run titles:from-summary                        (preview: 10 rows, real model calls, writes nothing)
 *   npm run titles:from-summary -- --limit 30          (preview 30)
 *   npm run titles:from-summary -- --slug <slug>       (preview one row)
 *   npm run titles:from-summary -- --write             (every bidding row with a 一句话总结)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { canRefresh, refreshTitlesFromSummary, REFRESH_COLUMNS, type CandidateRow, type RefreshRow, type TitleRefreshOutcome } from "../lib/ingestion/refresh-titles-from-summary";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const PAGE_SIZE = 1000;
const PREVIEW_DEFAULT = 10;

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function print(outcome: TitleRefreshOutcome) {
  console.log("─".repeat(78));
  console.log(`  ${outcome.slug}`);
  console.log(`  一句话总结      ${outcome.oneLineSummary}`);
  const show = (label: string, change: TitleRefreshOutcome["short"]) => {
    if (change.pinned) return console.log(`  ${label}  （你手动改过，跳过）${change.before ?? ""}`);
    if (change.after === change.before) {
      const why = change.problems.length > 0 ? `  ✗ 新的没通过：${change.problems.join("；")}` : "";
      return console.log(`  ${label}  不变：${change.before ?? "（空）"}${why}`);
    }
    console.log(`  ${label}  旧：${change.before ?? "（空）"}`);
    console.log(`  ${"".padEnd(label.length * 2)}  新：${change.after}`);
  };
  show("完整标题    ", outcome.title);
  for (const { note, reason } of outcome.title.refusedNotes) console.log(`                  没加的缩写说明：${note.abbr} → ${note.zh}（${reason}）`);
  show("订阅用户标题", outcome.short);
  show("访客标题    ", outcome.publicTitle);
  if (outcome.error) console.log(`  出错：${outcome.error}`);
}

async function main() {
  const args = process.argv.slice(2);
  const write = hasWriteFlag();
  const limitArg = argValue(args, "--limit");
  const slug = argValue(args, "--slug");

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error("DASHSCOPE_API_KEY isn't set. See .env.example.");
    process.exit(1);
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: RefreshRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from("tenders").select(REFRESH_COLUMNS).not("one_line_summary", "is", null);
    if (slug) query = query.eq("slug", slug);
    const { data, error } = await query.order("created_at", { ascending: false }).order("slug", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("读取 tenders 失败：" + error.message);
      process.exit(1);
    }
    const page = (data ?? []) as CandidateRow[];
    rows.push(...page.filter(canRefresh));
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`投标中（同网站「当前在招」）、有一句话总结、已翻译的项目：${rows.length} 条。已截止、已中标、已取消的不处理。`);
  if (rows.length === 0) return;

  const limit = limitArg ? Number(limitArg) : write ? rows.length : PREVIEW_DEFAULT;
  const selected = rows.slice(0, limit);
  console.log(write ? `写入 ${selected.length} 条（每批 10 条，每批两次模型调用，中途没有输出是正常的）…\n` : `预览最新的 ${selected.length} 条（真实调用模型，不写入）…\n`);

  const outcomes = await refreshTitlesFromSummary(supabase, selected, {
    write,
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });
  console.log("");
  // Preview prints every row; a write prints only rows that changed.
  for (const outcome of outcomes) {
    const changed = [outcome.title, outcome.short, outcome.publicTitle].some((c) => c.after !== c.before);
    if (!write || changed || outcome.error) print(outcome);
  }

  const count = (pick: (o: TitleRefreshOutcome) => { before: string | null; after: string | null }) => outcomes.filter((o) => pick(o).after !== pick(o).before).length;
  console.log("─".repeat(78));
  console.log(`会改动：完整标题 ${count((o) => o.title)} 条（只加缩写说明）、订阅用户标题 ${count((o) => o.short)} 条、访客标题 ${count((o) => o.publicTitle)} 条（共 ${outcomes.length} 条）。摘要一律不动。`);
  const errors = outcomes.filter((o) => o.error).length;
  if (errors) console.log(`出错 ${errors} 条，没有改动，可以再跑一次。`);
  if (write) console.log(`已写入 ${outcomes.filter((o) => o.written).length} 条。前台约 5 分钟后刷新。`);
  else console.log("预览，没有写入。看过没问题再加 --write。");
}

main();
