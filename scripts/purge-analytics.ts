/**
 * Clears first-party browsing history (analytics_events).
 *
 * What is in there: one row per page view, tender open, filter apply and
 * save/unsave, written by /api/analytics/events (migration 0016). Every row
 * recorded before launch is the author's own testing — weeks of opening the
 * same tenders from the same browsers — and it is what /admin/analytics
 * charts as 浏览趋势 and 近 30 天浏览. Leaving it in place means the first
 * real visitors arrive on top of a baseline that is entirely self-traffic,
 * and no number on that dashboard means anything until it is gone.
 *
 * The dashboard reads the analytics_daily_* views, which are views over this
 * table rather than stored aggregates, so deleting rows here moves the charts
 * immediately — there is nothing else to clear and nothing to rebuild.
 *
 * Deleting is safe in the sense that nothing else depends on these rows:
 * analytics_events is referenced by no other table, and it holds no data the
 * product reads at runtime. Favourites in particular are NOT stored here —
 * lib/saved.ts keeps them in localStorage alone, and the tender_save rows in
 * this table are a record that a save happened, never the save itself. It is
 * NOT reversible — there is no soft delete.
 *
 * Dry run by default, like every other purge script here.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 *
 * Usage:
 *   npm run purge:analytics                          (report only — deletes nothing)
 *   npm run purge:analytics -- --before=2026-09-14   (dry run, rows strictly before that date)
 *   npm run purge:analytics -- --before=2026-09-14 --write
 *   npm run purge:analytics -- --all --write         (everything)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? "";
const WRITE = hasWriteFlag();
const ALL = args.includes("--all");
const BEFORE = flag("before");

const EVENT_LABELS: Record<string, string> = {
  page_view: "页面浏览",
  tender_open: "打开项目",
  filter_apply: "使用筛选",
  tender_save: "收藏",
  tender_unsave: "取消收藏",
};

async function countRows(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  eventType?: string,
  before?: string,
): Promise<number> {
  let query = admin.from("analytics_events").select("id", { count: "exact", head: true });
  if (eventType) query = query.eq("event_type", eventType);
  if (before) query = query.lt("created_at", before);
  const { count, error } = await query;
  if (error) throw new Error(`analytics_events 读取失败：${error.message}`);
  return count ?? 0;
}

async function main() {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY（以及 NEXT_PUBLIC_SUPABASE_URL）必须设置。");

  if (BEFORE && !/^\d{4}-\d{2}-\d{2}$/.test(BEFORE)) {
    throw new Error(`--before 需要 YYYY-MM-DD 格式，收到的是「${BEFORE}」。`);
  }
  if (BEFORE && ALL) {
    throw new Error("--before 和 --all 只能给一个。");
  }

  // The cutoff is a plain date, read as UTC midnight. The dashboard groups by
  // America/Mexico_City, so a cutoff of today keeps a few hours of "today" in
  // Mexico that this call would otherwise treat as yesterday — deliberate:
  // the failure mode should be keeping a row too many, not deleting one too
  // many.
  const cutoff = BEFORE ? `${BEFORE}T00:00:00Z` : undefined;

  const total = await countRows(admin);
  if (total === 0) {
    console.log("analytics_events 是空的，没有浏览记录可清理。");
    return;
  }

  const { data: oldest } = await admin
    .from("analytics_events")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  const { data: newest } = await admin
    .from("analytics_events")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  console.log(`浏览记录共 ${total} 条`);
  if (oldest?.[0] && newest?.[0]) {
    console.log(`时间范围：${String(oldest[0].created_at).slice(0, 10)} ~ ${String(newest[0].created_at).slice(0, 10)}\n`);
  }

  console.log("按类型：");
  for (const [type, label] of Object.entries(EVENT_LABELS)) {
    const count = await countRows(admin, type);
    if (count > 0) console.log(`  ${label.padEnd(6)} ${String(count).padStart(7)}`);
  }

  if (!ALL && !cutoff) {
    console.log("\n只读运行。要清理：");
    console.log("  npm run purge:analytics -- --all --write                   清空全部");
    console.log("  npm run purge:analytics -- --before=YYYY-MM-DD --write     只清这个日期之前的");
    return;
  }

  const doomed = cutoff ? await countRows(admin, undefined, cutoff) : total;
  const scope = cutoff ? `${BEFORE} 之前的 ${doomed} 条` : `全部 ${doomed} 条`;

  if (doomed === 0) {
    console.log(`\n${BEFORE} 之前没有记录，无需清理。`);
    return;
  }

  if (!WRITE) {
    console.log(`\n将删除${scope}（保留 ${total - doomed} 条）。这是试运行，什么都没删——确认后加 --write。`);
    return;
  }

  // Not .neq("id", 0) or any other "match everything" trick: PostgREST
  // refuses an unfiltered delete, and gte on the identity column is the
  // honest way to say "every row" without a filter that could silently
  // match nothing.
  let query = admin.from("analytics_events").delete();
  query = cutoff ? query.lt("created_at", cutoff) : query.gte("id", 0);
  const { error } = await query;
  if (error) throw new Error(`删除失败：${error.message}`);

  const remaining = await countRows(admin);
  console.log(`\n已删除${scope}。现在还剩 ${remaining} 条。`);
  console.log("/admin/analytics 上的浏览趋势会立刻跟着变——它读的是这张表上的视图，没有另一份缓存。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
