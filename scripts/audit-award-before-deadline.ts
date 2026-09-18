/**
 * Lists every stored tender that claims to be AWARDED while its own bid
 * deadline is still in the future — the contradiction behind the 2026-09-18
 * report (一条 9/15 发布、交标 10/26 的墨西哥项目显示"已中标").
 *
 * lib/tender-status.ts rule 6 stops that reaching a reader: the display
 * status now believes the deadline over the stored flag. This script is the
 * other half — the display fix hides the symptom on every surface at once,
 * and says nothing about WHICH mapper is writing the wrong flag. Grouping the
 * offenders by source_name answers that, and the answer is what a real fix is
 * built on.
 *
 * Read-only. It never writes: the right correction depends on which side is
 * wrong for that source, and only the grouping tells us that.
 *
 * Reading the output:
 *   - a source with a HANDFUL of rows is usually the source contradicting
 *     itself (a status vocabulary word we map too eagerly);
 *   - a source with MOST of its rows here is a mapping bug, the way
 *     dof-search-mapper.ts's "Fallo" row once marked every CFE convocatoria
 *     awarded before bids could be submitted (fixed 2026-09-08);
 *   - `days_until_deadline` tells the two apart: a few days out is a race
 *     between an early award and a lagging deadline column, months out is a
 *     mapper reading a schedule as an outcome.
 *
 *   npm run audit:award-before-deadline
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

const PAGE_SIZE = 1000;

type Row = {
  slug: string;
  tender_number: string | null;
  title: { es?: string; zh?: string } | null;
  buyer: string | null;
  country: string | null;
  source_name: string | null;
  status: string;
  publication_date: string | null;
  submission_deadline: string | null;
  award_date: string | null;
  awarded_to: string | null;
};

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, buyer, country, source_name, status, publication_date, submission_deadline, award_date, awarded_to")
      .eq("status", "awarded")
      .gt("submission_deadline", now)
      // Explicit order: .range() paging over an unspecified row order drops
      // and repeats rows between pages (the same trap loadKnownTenders hit).
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    console.log("没有任何项目同时满足「状态=已中标」和「交标日期还没到」。");
    return;
  }

  console.log(`${rows.length} 条项目状态为「已中标」，但交标日期还在未来。\n`);

  const bySource = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.source_name ?? "(no source_name)";
    const held = bySource.get(key);
    if (held) held.push(row);
    else bySource.set(key, [row]);
  }

  // The count per source is the whole point of the script, so it leads.
  console.log("按来源分组：");
  for (const [source, sourceRows] of [...bySource].sort((a, b) => b[1].length - a[1].length)) {
    const gaps = sourceRows
      .map((row) => (row.submission_deadline ? daysBetween(now, row.submission_deadline) : 0))
      .sort((a, b) => a - b);
    const withRealAward = sourceRows.filter((row) => row.awarded_to).length;
    console.log(
      `  ${String(sourceRows.length).padStart(5)}  ${source}` +
        `  (交标还剩 ${gaps[0]}~${gaps[gaps.length - 1]} 天` +
        `${withRealAward > 0 ? `，其中 ${withRealAward} 条有真实中标方` : "，没有一条记录了中标方"})`,
    );
  }

  console.log("\n前 30 条：");
  for (const row of rows.slice(0, 30)) {
    const title = (row.title?.zh || row.title?.es || "").replace(/\s+/g, " ").slice(0, 52);
    console.log(
      [
        row.slug.padEnd(46).slice(0, 46),
        (row.country ?? "?").padEnd(8),
        `发布 ${row.publication_date?.slice(0, 10) ?? "—"}`,
        `交标 ${row.submission_deadline?.slice(0, 10) ?? "—"}`,
        `中标方 ${row.awarded_to ?? "—"}`,
        title,
      ].join(" | "),
    );
  }

  console.log(
    "\n说明：网站和后台已经不会再把这些显示成「已中标」了（lib/tender-status.ts 规则 6，交标日期优先）。" +
      "\n这份清单是用来定位到底是哪个 mapper 把状态写错的——把上面「按来源分组」那几行发给我就行。",
  );
}

main();
