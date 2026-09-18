/**
 * Points every Peru tender's 官方入口 button back at SEACE's public search
 * page, replacing the per-tender ficha deep links that were entered by hand
 * on 2026-09-15 and reported dead on 2026-09-18.
 *
 * Why they are dead, and why no per-tender link replaces them, is in
 * lib/peru-seace-url.ts — short version: a ficha URL resolves only inside the
 * browser session that walked through the buscador to reach it, so it works
 * for the person who pasted it and for nobody afterwards. A public button has
 * no such session, ever.
 *
 * This also normalizes the `prodapp2` spelling onto `prod2`, because the feed
 * supplies the first and the user browses the second; leaving both would mean
 * the next import undoes half of this.
 *
 * `ficha_url` is deliberately left alone. It records where a pasted cronograma
 * was read from, which is still true — the link stopped resolving, it did not
 * stop being where the schedule came from.
 *
 * The lock is RELEASED (source_url drops out of manual_field_overrides) rather
 * than kept. That column is read as "an import must keep its hands off this",
 * and once the stored value is exactly what the mapper now writes, a lock
 * saying otherwise is a note that outlives its reason — and would freeze the
 * old hostname in place the next time the canonical URL changes.
 *
 * Usage:
 *   npm run fix:peru-source-urls             (report only)
 *   npm run fix:peru-source-urls -- --write
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import { correctedSeaceSourceUrl, isSeaceFichaUrl, SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";

type Row = {
  id: string;
  slug: string;
  tender_number: string | null;
  title: { zh?: string; es?: string } | null;
  source_url: string | null;
  ficha_url: string | null;
  manual_field_overrides: string[] | null;
};

async function main() {
  const write = hasWriteFlag();
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, slug, tender_number, title, source_url, ficha_url, manual_field_overrides")
      .eq("country", "Peru")
      .range(from, from + 999);
    if (error) throw new Error(`读取失败：${error.message}`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const targets = rows
    .map((row) => ({ row, corrected: correctedSeaceSourceUrl(row.source_url) }))
    .filter((entry): entry is { row: Row; corrected: string } => entry.corrected !== null);

  const ficha = targets.filter((t) => isSeaceFichaUrl(t.row.source_url));
  const hostOnly = targets.filter((t) => !isSeaceFichaUrl(t.row.source_url));

  console.log(`秘鲁项目 ${rows.length} 条，需要改 ${targets.length} 条。`);
  console.log(`  失效的 ficha 直达链接：${ficha.length} 条`);
  console.log(`  只是主机名不一致（prodapp2 → prod2）：${hostOnly.length} 条\n`);

  for (const { row } of ficha) {
    console.log(`  ${row.slug}`);
    console.log(`    ${(row.title?.zh || row.title?.es || "").slice(0, 70)}`);
    console.log(`    现在：${row.source_url}`);
  }
  if (ficha.length > 0) {
    console.log(`\n  以上全部改为：${SEACE_PUBLIC_SEARCH_URL}`);
    console.log(`  ficha_url 保留不动 —— 它记录的是排期抄自哪里，这件事没有变。`);
  }

  if (targets.length === 0) {
    console.log("没有要改的。");
    return;
  }
  if (!write) {
    console.log(`\n试运行（加 -- --write 才真的写库）—— 什么都没动。`);
    return;
  }

  let changed = 0;
  for (const { row, corrected } of targets) {
    const overrides = ((row.manual_field_overrides as string[] | null) ?? []).filter((c) => c !== "source_url");
    const { error } = await supabase
      .from("tenders")
      .update({ source_url: corrected, manual_field_overrides: overrides })
      .eq("id", row.id);
    if (error) {
      console.error(`  ${row.slug} 写入失败：${error.message}`);
      continue;
    }
    changed += 1;
  }
  console.log(`\n已改 ${changed} 条${changed === targets.length ? "" : `，失败 ${targets.length - changed} 条`}。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
