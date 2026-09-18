/**
 * Strip the SECOP process-phase label out of titles already stored.
 *
 * SECOP appends the procurement stage to nombre_del_procedimiento — "(Fase
 * de Selección (Presentación de ofertas))" — which is not part of the
 * tender's name and moves as the process advances. The mapper strips it
 * (colombia-mapper.ts, stripProcessPhaseSuffix), but only for rows it
 * writes, so every row imported before that fix still carries it.
 *
 * They do not heal on their own. refreshColombiaTenders only re-reads the
 * references it still tracks — 53 on the run that prompted this — while the
 * stale titles are spread across every SECOP row ever imported. Waiting for
 * the daily job to reach them is waiting forever.
 *
 * Left alone, the label reaches customers twice: on the public title, and
 * again inside the Chinese, because a translator faithfully renders whatever
 * the Spanish says — one row came back as "（评选阶段：提交投标）".
 *
 * Resets zh alongside es. A translation made from the old Spanish describes
 * something the row no longer says, and zh === es is exactly what
 * translate-all-tenders.ts looks for, so the next run picks these up by
 * itself. Skips any field an admin hand-edited.
 *
 * Usage:
 *   npm run fix:phase-suffixes            (dry run — lists what would change)
 *   npm run fix:phase-suffixes -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { stripProcessPhaseSuffix } from "../lib/ingestion/colombia-mapper";
import type { LocalizedText } from "../types/tender";
import { hasWriteFlag } from "@/lib/cli-write-flag";

type Row = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  manual_field_overrides: string[] | null;
};

const hand = (row: Row, field: string) => (row.manual_field_overrides ?? []).includes(field);

async function main() {
  const write = hasWriteFlag();

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

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

  type Change = { row: Row; titleEs?: string; summaryEs?: string };
  const changes: Change[] = [];

  for (const row of rows) {
    const change: Change = { row };
    if (!hand(row, "title")) {
      const stripped = stripProcessPhaseSuffix(row.title.es);
      if (stripped !== row.title.es && stripped.length > 0) change.titleEs = stripped;
    }
    if (!hand(row, "summary")) {
      const stripped = stripProcessPhaseSuffix(row.summary.es);
      if (stripped !== row.summary.es && stripped.length > 0) change.summaryEs = stripped;
    }
    if (change.titleEs || change.summaryEs) changes.push(change);
  }

  console.log(`全库 ${rows.length} 条，其中 ${changes.length} 条标题或摘要还带着阶段标签。\n`);
  if (changes.length === 0) {
    console.log("没有需要处理的。");
    return;
  }

  for (const { row, titleEs } of changes.slice(0, write ? 0 : 25)) {
    if (!titleEs) continue;
    console.log(`  ${row.slug}`);
    console.log(`    现在  ${row.title.es}`);
    console.log(`    改为  ${titleEs}`);
    if (row.title.zh !== row.title.es) console.log(`    译文  ${row.title.zh}   ← 会被重置，下次翻译重做`);
  }
  if (!write && changes.length > 25) console.log(`  …另外 ${changes.length - 25} 条`);

  if (!write) {
    console.log(`\n试运行——什么都没改。确认无误后加 --write。`);
    return;
  }

  let fixed = 0;
  for (const { row, titleEs, summaryEs } of changes) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // en mirrors es for every untranslated field, and zh goes back to the
    // mirror so the next translation run re-does it from the corrected text.
    if (titleEs) update.title = { ...row.title, es: titleEs, en: titleEs, zh: titleEs };
    if (summaryEs) update.summary = { ...row.summary, es: summaryEs, en: summaryEs, zh: summaryEs };

    const { error } = await supabase.from("tenders").update(update).eq("slug", row.slug);
    if (error) {
      console.error(`  ${row.slug} 失败：${error.message}`);
      continue;
    }
    fixed += 1;
  }

  console.log(`已修正 ${fixed} / ${changes.length} 条。这些行的 zh 已重置，下次 translate:tenders 会重新翻译。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
