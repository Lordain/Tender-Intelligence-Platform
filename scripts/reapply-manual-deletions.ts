/**
 * Deletes tenders that are back in the table despite being on the admin's
 * manual-deletion list.
 *
 * Needed because upsert-tenders.ts used to treat a failed
 * tender_manual_deletions lookup as "nothing was manually deleted" and
 * write anyway, so one transient network error during an import re-inserted
 * every tender an admin had removed. That fallback is gone (the import now
 * stops instead), but a run that already happened has to be undone.
 *
 * Read-only by default: it lists what it would remove. Pass --write to
 * actually delete. The tenders it removes stay on the deletion list, so a
 * later import will keep skipping them.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   npm run purge:manually-deleted              (dry run)
 *   npm run purge:manually-deleted -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const WRITE = process.argv.includes("--write");
const PAGE = 1000;
/**
 * Slugs per `.in()` filter. That filter goes in the GET query string, and
 * 1000 slugs makes a URL Supabase's gateway rejects outright — reported by
 * Node as a bare `TypeError: fetch failed`. Paging reads can stay at 1000;
 * only filters built from a list need this.
 */
const FILTER_CHUNK = 100;

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set.");

  // Paged: the deletion list grows without bound and PostgREST caps a
  // select at 1000 rows without an error, which would silently leave the
  // rest of the list unenforced — the same shape of bug this script exists
  // to clean up after.
  const deletedSlugs: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tender_manual_deletions")
      .select("slug")
      .order("slug")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`读取 tender_manual_deletions 失败：${error.message}`);
    const page = (data ?? []).map((row) => row.slug as string);
    deletedSlugs.push(...page);
    if (page.length < PAGE) break;
  }

  if (deletedSlugs.length === 0) {
    console.log("手动删除列表为空，没有需要处理的项目。");
    return;
  }
  console.log(`手动删除列表共 ${deletedSlugs.length} 条。`);

  const present: { slug: string; title: string; country: string }[] = [];
  for (let i = 0; i < deletedSlugs.length; i += FILTER_CHUNK) {
    const chunk = deletedSlugs.slice(i, i + FILTER_CHUNK);
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title_es, title_zh, country")
      .in("slug", chunk);
    if (error) throw new Error(`读取 tenders 失败：${error.message}`);
    for (const row of data ?? []) {
      present.push({
        slug: row.slug as string,
        title: ((row.title_zh as string | null) || (row.title_es as string | null) || "").slice(0, 60),
        country: (row.country as string | null) ?? "",
      });
    }
  }

  if (present.length === 0) {
    console.log("✅ 没有任何已删除的项目重新出现在 tenders 表里。");
    return;
  }

  console.log(`\n${present.length} 个项目在手动删除列表上，但仍存在于 tenders 表：\n`);
  for (const row of present.slice(0, 50)) {
    console.log(`  ${row.slug.padEnd(34)} ${row.country.padEnd(4)} ${row.title}`);
  }
  if (present.length > 50) console.log(`  …以及另外 ${present.length - 50} 个`);

  if (!WRITE) {
    console.log(`\ndry run — 什么都没有删除。确认无误后加 --write 执行。`);
    return;
  }

  let removed = 0;
  for (let i = 0; i < present.length; i += FILTER_CHUNK) {
    const chunk = present.slice(i, i + FILTER_CHUNK).map((row) => row.slug);
    // Child rows (requirements/risks/key dates/documents) cascade from
    // tenders, so this is the only delete needed.
    const { error } = await supabase.from("tenders").delete().in("slug", chunk);
    if (error) throw new Error(`删除失败（已删除 ${removed} 个）：${error.message}`);
    removed += chunk.length;
  }
  console.log(`\n已删除 ${removed} 个项目。它们仍在手动删除列表上，之后的导入会继续跳过。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
