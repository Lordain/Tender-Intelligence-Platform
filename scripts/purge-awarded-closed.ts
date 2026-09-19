/**
 * Deletes rows that arrived ALREADY AWARDED with their bid deadline behind
 * them, and that carry no award facts to justify keeping them.
 *
 * ── Why this is not purge:closed-tenders ──────────────────────────────────
 *
 * That script's rule is isPastSubmissionDeadline(), and that function exempts
 * `status === "awarded"` on purpose: an award result is intelligence, and a
 * result necessarily arrives after the deadline. Its header says so in as many
 * words — "Deliberately does NOT touch awarded tenders."
 *
 * The exemption assumes the awarded row carries the result. Brazil's PNCP rows
 * do not. `tem_resultado` is a boolean: it says a result exists and not one
 * fact about it — no winner, no amount, no date, and nothing in the search row
 * to read them from. So the exemption let through rows that reach a reader as
 * 「已中标, no value, 交标 2025-10-02」, published 2026-09-18 (user, 2026-09-19,
 * three of them in 项目管理). They cannot be bid on and they say nothing about
 * who won, which is both audiences this platform has, missed.
 *
 * ingest-brazil.ts now refuses to write them. This is the one-off cleanup for
 * the rows written before that, and the same shape from any other source: the
 * test is "awarded, deadline passed, and no award payload", never "awarded".
 *
 * A row with awarded_value, awarded_to, or an award key date is KEPT, whatever
 * its deadline — that is the case the exemption exists for and it is working.
 *
 * Dry run by default. --write deletes.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { toCsv } from "../lib/ingestion/review-csv";
import { platformDay } from "../lib/tender-status";
import type { TenderStatus } from "../types/tender";
import { hasWriteFlag } from "@/lib/cli-write-flag";

const OUT_DIR = "exports";

type Row = {
  slug: string;
  tender_number: string;
  title: { zh?: string; es?: string };
  country: string;
  status: TenderStatus;
  source_name: string | null;
  submission_deadline: string | null;
  awarded_value: number | null;
  awarded_to: string | null;
};

/** The whole point of the script: what makes an awarded row worth keeping. */
function carriesAwardFacts(row: Row): boolean {
  return row.awarded_value !== null || (row.awarded_to !== null && row.awarded_to.trim() !== "");
}

async function main() {
  const shouldWrite = hasWriteFlag();

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
      .select("slug, tender_number, title, country, status, source_name, submission_deadline, awarded_value, awarded_to")
      .eq("status", "awarded")
      .not("submission_deadline", "is", null)
      .order("submission_deadline", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`读取失败：${error.message}`);
      process.exit(1);
    }
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  // Same timezone-correct comparison purge:closed-tenders uses — "due today is
  // still open" — rather than a raw string compare, so a row does not get
  // deleted on the morning of its own deadline.
  const today = platformDay(new Date());
  const stale = rows.filter((row) => {
    if (carriesAwardFacts(row)) return false;
    const deadline = row.submission_deadline ? platformDay(row.submission_deadline) : null;
    return deadline !== null && today !== null && deadline < today;
  });

  const keptForFacts = rows.filter((row) => carriesAwardFacts(row)).length;
  console.log(`已中标且有交标日的项目 ${rows.length} 个。`);
  console.log(`  其中 ${keptForFacts} 个带着中标方或中标金额 —— 这些是「已中标」豁免本来要保住的，一个都不动。`);
  console.log(`  ${stale.length} 个既投不了标、也没有中标信息。`);
  if (stale.length === 0) {
    console.log("没有要删的。");
    return;
  }

  const bySource = new Map<string, number>();
  for (const row of stale) bySource.set(row.source_name ?? "（无来源）", (bySource.get(row.source_name ?? "（无来源）") ?? 0) + 1);
  console.log("\n按来源：");
  for (const [source, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${source}`);
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const csvPath = join(OUT_DIR, `tenders-awarded-empty-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(
    csvPath,
    toCsv(
      ["slug", "tender_number", "title_zh", "country", "source_name", "submission_deadline"],
      stale.map((r) => [r.slug, r.tender_number, r.title.zh ?? r.title.es ?? "", r.country, r.source_name ?? "", r.submission_deadline]),
    ),
  );
  console.log(`\n${shouldWrite ? "即将删除" : "如果 --write 会删除"}的 ${stale.length} 条已写入 ${csvPath}`);

  if (!shouldWrite) {
    console.log("\n这是试运行，什么都没删。确认 CSV 之后加 --write 真的删除。");
    return;
  }

  // By slug, so what is deleted is exactly the set the CSV lists.
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < stale.length; i += CHUNK) {
    const slugs = stale.slice(i, i + CHUNK).map((row) => row.slug);
    const { error, count } = await supabase.from("tenders").delete({ count: "exact" }).in("slug", slugs);
    if (error) {
      console.error(`删除失败（第 ${i / CHUNK + 1} 批）：${error.message}`);
      process.exit(1);
    }
    deleted += count ?? 0;
  }

  console.log(`\n已删除 ${deleted} 个项目。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
