/**
 * Check every cronograma this platform read out of a bid document.
 *
 * The site cannot answer this question either — same shape of problem as
 * review-translations.ts. A tender page shows 交标截止日 2026-10-09 and it
 * looks like a fact; it only looks wrong next to the rest of that document's
 * own schedule, or next to the page it was read from. So this prints the
 * whole cronograma per tender, with the citation the extraction gave for
 * each row (migration 0047), and marks the ones that cannot be true
 * (lib/ingestion/key-date-checks.ts).
 *
 * Two things it reports that no check can decide:
 *   - coverage: how many tenders still have no bid deadline at all. That is
 *     the population this whole feature exists for (Peru OECE publishes
 *     none), so it is the number that says whether it is working.
 *   - a sample to open by hand. A checker can only catch a date the schedule
 *     contradicts; a cronograma that is uniformly one month off is
 *     internally perfect and wrong, and only the PDF settles it. --sample
 *     prints N tenders with their document links for exactly that.
 *
 * Read-only: selects and prints, writes nothing to Supabase.
 *
 * Usage:
 *   npm run review:key-dates                     (coverage + everything flagged)
 *   npm run review:key-dates -- --all            (print every extracted cronograma)
 *   npm run review:key-dates -- --sample 5       (5 to open against the PDF by hand)
 *   npm run review:key-dates -- --slug X --slug Y
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { findKeyDateProblems, submissionIsSuspect } from "../lib/ingestion/key-date-checks";
import { KEY_DATE_TYPE_LABELS } from "../lib/tender-labels";
import type { TenderKeyDate } from "../types/tender";

type KeyDateRow = {
  type: TenderKeyDate["type"];
  date: string;
  notes: { zh?: string } | null;
  source_reference: string | null;
  extracted_from_document: boolean;
  manually_added: boolean;
};

type TenderRow = {
  id: string;
  slug: string;
  title: { zh?: string; es?: string };
  source_name: string | null;
  source_url: string | null;
  country: string | null;
  publication_date: string | null;
  submission_deadline: string | null;
};

const RULE = "─".repeat(78);
const zh = (type: TenderKeyDate["type"]) => KEY_DATE_TYPE_LABELS[type].zh;

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function slugArgs(args: string[]): string[] {
  const slugs: string[] = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === "--slug" && args[i + 1]) slugs.push(args[i + 1]);
  return slugs;
}

/** Paged for the same reason every other read script pages: PostgREST caps an unranged select at 1000 and would silently return only the first page. */
async function selectAll<T>(run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`读取失败：${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function printCronograma(rows: KeyDateRow[]) {
  // Document order, which is chronological order in a correct cronograma —
  // so an out-of-order row is visible in the printout itself, not only in
  // the warning under it.
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const origin = row.extracted_from_document ? "标书" : row.manually_added ? "人工" : "数据源";
    const cite = row.source_reference ? `  ← ${row.source_reference}` : row.extracted_from_document ? "  ← 无出处（本次提取之前写入的）" : "";
    console.log(`    ${row.date}  ${zh(row.type).padEnd(6, "　")}  [${origin}]${row.notes?.zh ? `  ${row.notes.zh}` : ""}${cite}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = slugArgs(args);
  const showAll = args.includes("--all");
  const sample = Number(argValue(args, "--sample") ?? 0);

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  const tenders = await selectAll<TenderRow>((from, to) =>
    supabase.from("tenders").select("id, slug, title, source_name, source_url, country, publication_date, submission_deadline").range(from, to),
  );
  const keyDates = await selectAll<KeyDateRow & { tender_id: string }>((from, to) =>
    supabase
      .from("tender_key_dates")
      .select("tender_id, type, date, notes, source_reference, extracted_from_document, manually_added")
      .range(from, to),
  );

  const byTender = new Map<string, KeyDateRow[]>();
  for (const row of keyDates) {
    const list = byTender.get(row.tender_id);
    if (list) list.push(row);
    else byTender.set(row.tender_id, [row]);
  }

  const extracted = tenders
    .map((tender) => ({ tender, rows: byTender.get(tender.id) ?? [] }))
    .filter((entry) => entry.rows.some((row) => row.extracted_from_document));

  const bySlug = new Map(extracted.map((entry) => [entry.tender.slug, entry]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    console.error(`这些 slug 没有从标书提取的日期：\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }

  // Coverage first, because it is the number that says whether the feature
  // is doing its job — and it is the one a list of flags cannot show.
  const noDeadline = tenders.filter((t) => !t.submission_deadline);
  const rescued = extracted.filter(({ tender, rows }) => tender.submission_deadline && rows.some((r) => r.extracted_from_document && r.type === "submission"));
  console.log(RULE);
  console.log(`库里 ${tenders.length} 个项目，其中 ${extracted.length} 个有从标书读出来的日程。`);
  console.log(`  这 ${extracted.length} 个里，${rescued.length} 个的交标截止日是标书给的（数据源本来没有）。`);
  console.log(`  全库还有 ${noDeadline.length} 个项目没有任何交标截止日——前台只能按发布日起 45 天的兜底规则显示。`);

  const flagged: { slug: string; messages: string[] }[] = [];

  const scoped = slugs.length > 0 ? slugs.map((slug) => bySlug.get(slug)!) : extracted;
  for (const { tender, rows } of scoped) {
    const documentRows = rows.filter((row) => row.extracted_from_document);
    const problems = findKeyDateProblems(documentRows, { publicationDate: tender.publication_date });
    const show = showAll || slugs.length > 0 || problems.length > 0;
    if (problems.length > 0) flagged.push({ slug: tender.slug, messages: problems.map((p) => p.message) });
    if (!show) continue;

    console.log(`\n${RULE}\n${tender.slug}${tender.source_name ? `  (${tender.source_name})` : ""}${tender.country ? `  ${tender.country}` : ""}`);
    console.log(`  ${tender.title.zh ?? tender.title.es ?? ""}`);
    console.log(`  发布 ${tender.publication_date ?? "—"}   交标 ${tender.submission_deadline?.slice(0, 10) ?? "—"}`);
    printCronograma(rows);
    for (const problem of problems) console.log(`  ⚠ ${problem.message}`);
    if (submissionIsSuspect(problems)) console.log("  ⚠ 交标截止日本身有疑点——这一条不应该直接采信。");
  }

  if (flagged.length > 0) {
    console.log(`\n${RULE}\n⚠ ${flagged.length} 个项目的日程自相矛盾：`);
    for (const entry of flagged) console.log(`  ${entry.slug}\n${entry.messages.map((m) => `      ${m}`).join("\n")}`);
    console.log(`\n  核对后可以在后台改：/admin/tenders/<slug>，「其他关键日期」区域。`);
  } else if (extracted.length > 0) {
    console.log(`\n${RULE}\n所有日程都自洽——没有把日和月读反、也没有年份读错的迹象。`);
  }

  // Self-consistency is not correctness: a cronograma read one month late in
  // every row passes every check above. Only the document settles that, so
  // the script's last act is to hand over a short list to open by hand.
  if (sample > 0) {
    const clean = extracted.filter(({ tender }) => !flagged.some((f) => f.slug === tender.slug));
    console.log(`\n${RULE}\n抽查 ${Math.min(sample, clean.length)} 个（检查器查不出「整体错一个月」这种情况，只能对着原文看）：`);
    for (const { tender, rows } of clean.slice(0, sample)) {
      console.log(`\n  ${tender.slug}`);
      console.log(`  原文入口  ${tender.source_url ?? "—"}`);
      const submission = rows.find((r) => r.extracted_from_document && r.type === "submission");
      console.log(`  交标      ${submission ? `${submission.date}   ${submission.source_reference ?? "（无出处）"}` : "标书里没读到"}`);
    }
  }

  console.log(`\n${RULE}`);
  if (!showAll && slugs.length === 0) console.log("加 --all 看全部日程，加 --sample 5 抽几个对着标书核。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
