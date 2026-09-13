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
 * When the answer is zero it says WHY, which is the whole difference
 * between a number and a finding. The first run answered "0 of 285" and
 * stopped there, and four completely different situations produce that same
 * zero: no bid document has reached the platform, documents are here but
 * were never analysed, they were analysed before the extraction learned to
 * read a cronograma, or they were analysed since and the model genuinely
 * found no schedule. Each has a different next action and only one of them
 * is a bug. So the script walks the funnel.
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

type DocumentRow = { tender_id: string; extraction_status: string | null; extracted_at: string | null };

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

  if (extracted.length === 0) await explainTheZero(supabase, tenders, byTender);

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

/**
 * Why no tender has a cronograma. Runs only when the count is zero, because
 * that is the only time the funnel is the interesting thing — once dates
 * exist, the flags and the sample are.
 *
 * Reads the pipeline backwards, from what should be there to what is, and
 * names the one step that is empty. "Documents were analysed but none of
 * them produced a date" is the only answer here that means something is
 * broken; the rest mean work has not been done yet, which is worth knowing
 * before anyone goes looking for a bug.
 */
async function explainTheZero(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  tenders: TenderRow[],
  keyDatesByTender: Map<string, KeyDateRow[]>,
) {
  const documents = await selectAll<DocumentRow>((from, to) =>
    supabase.from("tender_documents").select("tender_id, extraction_status, extracted_at").range(from, to),
  );
  // The step between "nothing" and "we hold the file": a KNOWN official
  // download URL. Worth its own line because the two states need completely
  // different work — links present means one button on
  // /admin/documents-needed, links absent means finding them per source, and
  // for two of the three sources that is not possible at all.
  const links = await selectAll<{ tender_id: string }>((from, to) =>
    supabase.from("tender_document_links").select("tender_id").range(from, to),
  );
  const requirements = await selectAll<{ tender_id: string }>((from, to) =>
    supabase.from("tender_requirements").select("tender_id").range(from, to),
  );

  const withLinks = new Set(links.map((row) => row.tender_id));
  const withDocuments = new Set(documents.map((row) => row.tender_id));
  const extractedDocs = documents.filter((row) => row.extraction_status === "extracted");
  const withAnalysis = new Set(requirements.map((row) => row.tender_id));
  const withAnyKeyDate = new Set([...keyDatesByTender.entries()].filter(([, rows]) => rows.length > 0).map(([id]) => id));

  console.log(`\n${RULE}\n为什么是 0 —— 按流水线倒着看：`);
  console.log(`  ${String(tenders.length).padStart(4)} 个项目`);
  console.log(`  ${String(withLinks.size).padStart(4)} 个有官方下载链接（tender_document_links）`);
  console.log(`  ${String(withDocuments.size).padStart(4)} 个有标书文件记录（tender_documents）`);
  console.log(`  ${String(extractedDocs.length).padStart(4)} 份文件标记为已提取`);
  console.log(`  ${String(withAnalysis.size).padStart(4)} 个有分析结果（资质/业绩/所需文件）`);
  console.log(`  ${String(withAnyKeyDate.size).padStart(4)} 个有任何关键日期（含数据源给的）`);
  console.log(`     0 个有从标书读出来的日程`);

  console.log("");
  if (withDocuments.size === 0 && withLinks.size > 0) {
    console.log(`  卡在下载这一步：${withLinks.size} 个项目已经有官方下载链接，但一个文件都还没取回来。`);
    console.log("  /admin/documents-needed → 勾选 → 批量下载标书（下成一个 ZIP），解压后");
    console.log("  npm run dev → /admin/local-batch 填那个文件夹路径。");
    console.log("  链接目前只有秘鲁 SEACE 有——正好是最需要的：那边的交标日只存在于标书里。");
  } else if (withDocuments.size === 0) {
    console.log("  卡在最前面：既没有标书文件，也没有任何官方下载链接。");
    console.log("  秘鲁：npm run backfill:peru-documents -- --write 先把链接抓回来，再按上面下载。");
    console.log("  墨西哥 Compras MX：有反自动化网关，只能人工去官网下，再 npm run ingest:documents。");
    console.log("  哥伦比亚 SECOP II：详情页有 CAPTCHA，同样只能人工下。");
  } else if (withAnalysis.size === 0) {
    console.log("  文件在，但一次分析都没跑过。npm run dev → /admin/local-batch，填标书文件夹路径。");
  } else {
    console.log("  分析跑过，但没产出任何标书日程。两种可能，含义完全不同：");
    console.log("    a) 这些分析是在提取器学会读 cronograma 之前跑的（2026-09-12 之前）——重跑一次就有了；");
    console.log("    b) 或者跑的是「导入分析结果」那条路，它在 2026-09-13 之前根本不写关键日期（已修）。");
    console.log("  两种都是重跑一次分析就能确认。优先挑秘鲁的项目：那边的交标日只存在于标书里。");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
