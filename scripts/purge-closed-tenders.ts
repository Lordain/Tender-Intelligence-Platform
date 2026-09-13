/**
 * Deletes tenders whose bid deadline has already passed.
 *
 * The companion to the import gate added the same day
 * (isPastSubmissionDeadline, wired into upsertTendersBatched): that stops
 * new ones arriving, this clears the ones already stored. The user found
 * them by hand in the admin list (2026-09-13) — PEMEX rows from March to
 * May, Colombia rows whose deadline had passed the week before, Compras MX
 * rows with 交标 dates in 2023 and 2024 — and deleted several screens of
 * them one row at a time. That is the job this script exists to not repeat.
 *
 * Not the same cutoff as purge:old-tenders, which deletes by
 * publication_date. That one cannot see these at all: the worst of them
 * carry an ESTIMATED publication date (the ingestion timestamp, because the
 * source publishes no such column — see Tender.publicationDateIsEstimated),
 * so by publication date they look like today's newest rows while their
 * deadline is two years gone.
 *
 * Deliberately does NOT touch `awarded` tenders. Their deadline has passed
 * by definition and the award result is the reason they are kept — the
 * public award-result section exists for them. Same exemption the import
 * gate makes, for the same reason.
 *
 * Related rows (tender_requirements/tender_key_dates/tender_risks/
 * tender_documents) cascade on delete (0001_init.sql), so deleting the
 * tender row is enough.
 *
 * A tender due TODAY is kept: platformDay()'s rule, the same one the site
 * uses to decide 已截止, so this never deletes something the site is still
 * showing as open.
 *
 * Dry run by default, like every other purge script here — it reports what
 * WOULD go and writes a CSV to exports/ for review; only --write deletes.
 *
 * Usage:
 *   npm run purge:closed-tenders                 (dry run — exports a CSV, deletes nothing)
 *   npm run purge:closed-tenders -- --write      (actually deletes)
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { toCsv } from "../lib/ingestion/review-csv";
import { isPastSubmissionDeadline } from "../lib/ingestion/recency";
import type { TenderStatus } from "../types/tender";

const OUT_DIR = "exports";

type Row = {
  slug: string;
  tender_number: string;
  title: { zh?: string; es?: string };
  country: string;
  status: TenderStatus;
  source_name: string | null;
  publication_date: string;
  publication_date_is_estimated: boolean | null;
  submission_deadline: string | null;
};

async function main() {
  const shouldWrite = process.argv.includes("--write");

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  // Read every row and decide in TypeScript rather than filtering in the
  // query. The rule is isPastSubmissionDeadline() — the awarded exemption
  // and the timezone-correct "due today is still open" comparison — and a
  // .lt() on submission_deadline would be a second, subtly different copy
  // of it. One of the two would drift, and the one that drifts silently is
  // the one that deletes rows.
  const PAGE_SIZE = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug, tender_number, title, country, status, source_name, publication_date, publication_date_is_estimated, submission_deadline")
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

  const closed = rows.filter((row) => isPastSubmissionDeadline({ submissionDeadline: row.submission_deadline ?? undefined, status: row.status }));

  console.log(`有交标截止日的项目 ${rows.length} 个，其中 ${closed.length} 个已经过了截止日。`);
  if (closed.length === 0) {
    console.log("没有要删的。");
    return;
  }

  // By source, because that is the actionable part: a source contributing
  // most of these is a source whose import window or mapper is the real
  // problem, not a pile of rows to delete again next month.
  const bySource = new Map<string, number>();
  for (const row of closed) bySource.set(row.source_name ?? "（无来源）", (bySource.get(row.source_name ?? "（无来源）") ?? 0) + 1);
  console.log("\n按来源：");
  for (const [source, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${source}`);
  }

  const estimated = closed.filter((row) => row.publication_date_is_estimated).length;
  if (estimated > 0) {
    console.log(`\n其中 ${estimated} 个的发布日期是「估」（入库时间，不是真实发布日）——按发布日期的窗口永远筛不掉这些，只有交标日期能。`);
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const csvPath = join(OUT_DIR, `tenders-closed-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(
    csvPath,
    toCsv(
      ["slug", "tender_number", "title_zh", "country", "source_name", "status", "publication_date", "publication_date_is_estimated", "submission_deadline"],
      closed.map((r) => [
        r.slug,
        r.tender_number,
        r.title.zh ?? r.title.es ?? "",
        r.country,
        r.source_name ?? "",
        r.status,
        r.publication_date,
        r.publication_date_is_estimated ? "yes" : "no",
        r.submission_deadline,
      ]),
    ),
  );
  console.log(`\n${shouldWrite ? "即将删除" : "如果 --write 会删除"}的 ${closed.length} 条已写入 ${csvPath}`);

  if (!shouldWrite) {
    console.log("\n这是试运行，什么都没删。确认 CSV 之后加 --write 真的删除。");
    return;
  }

  // Deleted by slug in chunks rather than by a date filter, so what is
  // deleted is exactly the set the CSV lists — no second evaluation of the
  // rule against a database that may have moved on between the two queries.
  const CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < closed.length; i += CHUNK) {
    const slugs = closed.slice(i, i + CHUNK).map((row) => row.slug);
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
