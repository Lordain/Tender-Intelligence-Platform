/**
 * Put a machine translation back to the untranslated mirror (zh = es), which
 * is what makes the row eligible for translation again.
 *
 * This is the undo for `npm run translate:tenders -- --write`. Without it a
 * batch is a one-way door: translate-all-tenders.ts picks up exactly the rows
 * where zh === es, so a translation you dislike is invisible to the next run
 * no matter how much the prompt improves. Judging 50 written rows is the
 * honest way to evaluate quality, and that is only safe if you can take them
 * back.
 *
 * Never touches a field an admin hand-edited (manual_field_overrides,
 * migration 0032) — the same rule the translator applies. Someone's own
 * Chinese is not a machine translation, and resetting it to Spanish would
 * destroy work no re-run can reproduce.
 *
 * Decided per field, like needsTitle/needsSummary: a row whose title a human
 * owns can still have its machine-translated summary reset.
 *
 * Usage:
 *   npm run reset:translations                              (dry run — counts and slugs, writes nothing)
 *   npm run reset:translations -- --slug X --slug Y --write (just those rows)
 *   npm run reset:translations -- --all --write             (every machine-translated row)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import type { LocalizedText } from "../types/tender";

type Row = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  manual_field_overrides: string[] | null;
};

const hand = (row: Row, field: string) => (row.manual_field_overrides ?? []).includes(field);
const titleIsMachine = (row: Row) => row.title.zh !== row.title.es && !hand(row, "title");
const summaryIsMachine = (row: Row) => row.summary.zh !== row.summary.es && !hand(row, "summary");

function slugArgs(args: string[]): string[] {
  const slugs: string[] = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === "--slug" && args[i + 1]) slugs.push(args[i + 1]);
  return slugs;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const all = args.includes("--all");
  const slugs = slugArgs(args);

  if (write && !all && slugs.length === 0) {
    console.error("--write 需要指定范围：--all，或者一个及以上 --slug。");
    process.exit(1);
  }
  if (all && slugs.length > 0) {
    console.error("--all 和 --slug 不能同时用。");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Same paging as translate-all-tenders.ts: PostgREST caps an unranged
  // select at 1000, and silently returning the first page would under-report.
  const PAGE_SIZE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, title, summary, manual_field_overrides")
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

  const scoped = slugs.length > 0 ? slugs.map((s) => bySlug.get(s)!) : rows;
  const targets = scoped.filter((r) => titleIsMachine(r) || summaryIsMachine(r));

  console.log(`全库 ${rows.length} 条，其中带机器译文的 ${rows.filter((r) => titleIsMachine(r) || summaryIsMachine(r)).length} 条。`);
  console.log(`本次范围命中 ${targets.length} 条。\n`);

  if (targets.length === 0) {
    console.log("没有需要重置的。");
    return;
  }

  for (const row of targets.slice(0, write ? 0 : 20)) {
    const fields = [titleIsMachine(row) ? "标题" : null, summaryIsMachine(row) ? "摘要" : null].filter(Boolean).join(" + ");
    console.log(`  ${row.slug}  [${fields}]`);
    if (titleIsMachine(row)) console.log(`      ${row.title.zh}`);
  }
  if (!write && targets.length > 20) console.log(`  …另外 ${targets.length - 20} 条`);

  if (!write) {
    console.log(`\n试运行——什么都没改。确认无误后加 --write。`);
    return;
  }

  let reset = 0;
  for (const row of targets) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (titleIsMachine(row)) update.title = { ...row.title, zh: row.title.es };
    if (summaryIsMachine(row)) update.summary = { ...row.summary, zh: row.summary.es };

    const { error } = await supabase.from("tenders").update(update).eq("slug", row.slug);
    if (error) {
      console.error(`  ${row.slug} 重置失败：${error.message}`);
      continue;
    }
    reset += 1;
  }

  console.log(`已重置 ${reset} / ${targets.length} 条。这些行现在 zh === es，下一次 translate:tenders 会重新翻译它们。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
