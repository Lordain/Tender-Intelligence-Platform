/**
 * Deletes tenders first inserted on or after a given time — a rollback for
 * one bad import run.
 *
 * `created_at` is set by the database on INSERT only, so an upsert that
 * merely refreshed an existing tender keeps its original value. Filtering
 * on it therefore selects rows this import ADDED, not rows it touched.
 *
 * Two modes, and the difference matters:
 *
 *   default      delete only. A later import can bring these back, which is
 *                what you want when the run itself was wrong (bad source
 *                file, a lookup that failed) and you intend to redo it.
 *   --tombstone  also record each slug in tender_manual_deletions, so every
 *                future import skips it permanently. Use only for tenders
 *                that should never appear again — this is the same record
 *                the admin UI's delete writes.
 *
 * Read-only until --write. Requires SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npm run purge:since -- --since=2026-09-07                       (dry run)
 *   npm run purge:since -- --since=2026-09-07 --country=MX
 *   npm run purge:since -- --since=2026-09-07 --write
 *   npm run purge:since -- --since=2026-09-07 --write --tombstone
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const WRITE = args.includes("--write");
const TOMBSTONE = args.includes("--tombstone");
const COUNTRY = flag("country");
const SINCE = flag("since");
const FILTER_CHUNK = 100;

async function main() {
  if (!SINCE) throw new Error("必须指定 --since=YYYY-MM-DD（或完整 ISO 时间）。");
  const since = new Date(SINCE.length === 10 ? `${SINCE}T00:00:00.000Z` : SINCE);
  if (Number.isNaN(since.getTime())) throw new Error(`无法解析 --since=${SINCE}`);

  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set.");

  let query = supabase
    .from("tenders")
    .select("slug, title_es, title_zh, country, relevance_tier, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at");
  if (COUNTRY) query = query.eq("country", COUNTRY);

  const { data, error } = await query;
  if (error) throw new Error(`读取 tenders 失败：${error.message}`);
  const rows = (data ?? []) as { slug: string; title_es: string | null; title_zh: string | null; country: string; relevance_tier: string | null }[];

  if (rows.length === 0) {
    console.log(`没有在 ${since.toISOString()} 之后新增的项目${COUNTRY ? `（国家=${COUNTRY}）` : ""}。`);
    return;
  }

  const byTier = new Map<string, number>();
  for (const row of rows) byTier.set(row.relevance_tier ?? "(无)", (byTier.get(row.relevance_tier ?? "(无)") ?? 0) + 1);

  console.log(`${rows.length} 个项目是在 ${since.toISOString()} 之后新增的${COUNTRY ? `（国家=${COUNTRY}）` : ""}：\n`);
  for (const [tier, count] of [...byTier].sort((a, b) => b[1] - a[1])) console.log(`  ${tier.padEnd(14)} ${count}`);
  console.log();
  for (const row of rows.slice(0, 20)) {
    console.log(`  ${row.slug.padEnd(34)} ${row.country.padEnd(4)} ${((row.title_zh || row.title_es) ?? "").slice(0, 56)}`);
  }
  if (rows.length > 20) console.log(`  …以及另外 ${rows.length - 20} 个`);

  if (!WRITE) {
    console.log(`\ndry run — 什么都没有删除。`);
    console.log(`确认无误后加 --write；若这些项目以后也不该再出现，再加 --tombstone。`);
    return;
  }

  const slugs = rows.map((row) => row.slug);

  if (TOMBSTONE) {
    // Recorded BEFORE deleting: if the delete then fails partway, the
    // tombstones are harmless, while the reverse order could delete rows
    // that nothing remembers should stay deleted.
    for (let i = 0; i < slugs.length; i += FILTER_CHUNK) {
      const chunk = slugs.slice(i, i + FILTER_CHUNK);
      const { error: tombstoneError } = await supabase
        .from("tender_manual_deletions")
        .upsert(chunk.map((slug) => ({ slug })), { onConflict: "slug" });
      if (tombstoneError) throw new Error(`写入 tender_manual_deletions 失败，未执行删除：${tombstoneError.message}`);
    }
    console.log(`已记录 ${slugs.length} 个墓碑，之后的导入会跳过它们。`);
  }

  let removed = 0;
  for (let i = 0; i < slugs.length; i += FILTER_CHUNK) {
    const chunk = slugs.slice(i, i + FILTER_CHUNK);
    const { error: deleteError } = await supabase.from("tenders").delete().in("slug", chunk);
    if (deleteError) throw new Error(`删除失败（已删除 ${removed} 个）：${deleteError.message}`);
    removed += chunk.length;
  }
  console.log(`\n已删除 ${removed} 个项目。${TOMBSTONE ? "" : "未记录墓碑——下次导入若仍符合筛选条件，它们会重新出现。"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
