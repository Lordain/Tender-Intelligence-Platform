/**
 * Gives Mexican tenders a 交标截止日 without re-reading a single document.
 *
 * The gap, reported 2026-09-14: with Peru's 65 fichas pasted in by hand, the
 * admin list's 缺交标日期 filter came down to Mexico — CFE and PEMEX rows
 * showing 交标 —. Those are not missing the date because nobody published
 * it: LAASSP/LOPSRM schedule handing the proposals in and opening them as
 * ONE act, so the opening date these tenders already carry IS the deadline.
 * The date was on the platform the whole time, filed under the wrong name.
 *
 * See lib/ingestion/mexico-opening-deadline.ts for the rule and, more
 * importantly, for the case it refuses: a two-envelope procedure opens the
 * economic proposals days after the technical ones, both as type "opening",
 * and filling from that second session would publish a deadline after
 * bidding had already closed.
 *
 * Fills only what is empty — a deadline from the source, a document or an
 * admin always wins — and rebuilds the timeline mirror through the same
 * syncKeyDatesForTopLevelFields() every other write goes through, so the
 * overview card and the 关键日期 timeline cannot disagree.
 *
 * Everything it cannot fill is printed with its source URL, because that
 * list is the real output: it is exactly the set that needs the schedule
 * pasted in or the bid document analysed.
 *
 * Usage:
 *   npm run backfill:mx-deadlines                  (dry run — prints what it would do, writes nothing)
 *   npm run backfill:mx-deadlines -- --write        (fills the column + syncs the timeline)
 *   npm run backfill:mx-deadlines -- --country Peru (same rule elsewhere — see the warning below)
 *
 * --country is deliberately awkward: the one-act rule is Mexican law. Peru
 * and Colombia publish a separate opening, so pointing this at them would
 * invent deadlines. It exists only so a future country can be checked in a
 * dry run before anyone decides.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { syncKeyDatesForTopLevelFields } from "../lib/db/key-dates-sync";
import { deadlineFromOpening } from "../lib/ingestion/mexico-opening-deadline";
import { KEY_DATE_TYPE_LABELS } from "../lib/tender-labels";
import type { TenderKeyDate } from "../types/tender";

type TenderRow = {
  id: string;
  slug: string;
  title: { zh?: string; es?: string };
  source_name: string | null;
  source_url: string | null;
  publication_date: string | null;
  submission_deadline: string | null;
  award_date: string | null;
};

type KeyDateRow = {
  tender_id: string;
  type: TenderKeyDate["type"];
  date: string;
  notes: { es?: string; en?: string; zh?: string } | null;
  extracted_from_document: boolean;
  manually_added: boolean;
};

type DocumentRow = { tender_id: string; extraction_status: string | null };

const RULE = "─".repeat(78);
const zh = (type: TenderKeyDate["type"]) => KEY_DATE_TYPE_LABELS[type].zh;
const day = (value: string | null | undefined) => value?.slice(0, 10) ?? "—";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

/** Chunked because PostgREST puts the whole `in` list in the URL and a few hundred ids overrun it. */
async function selectByTenderIds<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await run(ids.slice(i, i + 200));
    if (error) throw new Error(`读取失败：${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const country = argValue(args, "--country") ?? "Mexico";

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  if (country !== "Mexico") {
    console.log(`⚠ ${country}：一标一开（presentación y apertura 同一场）是墨西哥的法定程序，别的国家开标通常在交标之后单独一天。`);
    console.log("  这里只允许空跑，看看数据长什么样；要真写进去，得先确认该国的程序确实如此。\n");
    if (shouldWrite) {
      console.error("拒绝执行：--write 仅对墨西哥开放。");
      process.exit(1);
    }
  }

  const { data: tenderData, error: tenderError } = await supabase
    .from("tenders")
    .select("id, slug, title, source_name, source_url, publication_date, submission_deadline, award_date")
    .eq("country", country)
    .is("submission_deadline", null);
  if (tenderError) {
    console.error(`读取项目失败：${tenderError.message}`);
    process.exit(1);
  }
  const tenders = (tenderData ?? []) as TenderRow[];

  console.log(RULE);
  console.log(`${country}：${tenders.length} 个项目没有交标截止日。`);
  if (tenders.length === 0) return;

  const ids = tenders.map((t) => t.id);
  const keyDates = await selectByTenderIds<KeyDateRow>(ids, (chunk) =>
    supabase
      .from("tender_key_dates")
      .select("tender_id, type, date, notes, extracted_from_document, manually_added")
      .in("tender_id", chunk),
  );
  const documents = await selectByTenderIds<DocumentRow>(ids, (chunk) =>
    supabase.from("tender_documents").select("tender_id, extraction_status").in("tender_id", chunk),
  );

  const byTender = new Map<string, KeyDateRow[]>();
  for (const row of keyDates) {
    const list = byTender.get(row.tender_id);
    if (list) list.push(row);
    else byTender.set(row.tender_id, [row]);
  }
  const documentsByTender = new Map<string, DocumentRow[]>();
  for (const row of documents) {
    const list = documentsByTender.get(row.tender_id);
    if (list) list.push(row);
    else documentsByTender.set(row.tender_id, [row]);
  }

  const fillable: { tender: TenderRow; date: string; basis: string }[] = [];
  const stuck: { tender: TenderRow; why: string }[] = [];

  for (const tender of tenders) {
    const rows = byTender.get(tender.id) ?? [];
    const docs = documentsByTender.get(tender.id) ?? [];
    const verdict = deadlineFromOpening(rows);

    console.log(`\n${RULE}\n${tender.slug}${tender.source_name ? `  (${tender.source_name})` : ""}`);
    console.log(`  ${tender.title.zh ?? tender.title.es ?? ""}`);
    console.log(`  发布 ${day(tender.publication_date)}   现有日期 ${rows.length} 条   标书 ${docs.length} 份${docs.length > 0 ? `（${docs.map((d) => d.extraction_status ?? "未分析").join("、")}）` : ""}`);
    for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      const origin = row.extracted_from_document ? "标书" : row.manually_added ? "人工" : "数据源";
      console.log(`    ${day(row.date)}  ${zh(row.type).padEnd(6, "　")}  [${origin}]${row.notes?.zh ? `  ${row.notes.zh}` : ""}`);
    }

    if (verdict.ok) {
      fillable.push({ tender, date: verdict.date, basis: verdict.basis });
      console.log(`  → 交标截止日可填 ${day(verdict.date)}（依据：${verdict.basis}）`);
      continue;
    }
    const why =
      verdict.reason === "economic_only"
        ? "只有商务标开标——那是交标之后的第二场，不能当截止日"
        : "没有开标日期可依据";
    stuck.push({ tender, why });
    console.log(`  → 填不了：${why}`);
  }

  console.log(`\n${RULE}`);
  console.log(`可填 ${fillable.length} 个，填不了 ${stuck.length} 个。`);

  if (stuck.length > 0) {
    console.log("\n这些需要人工补（打开链接，把日程粘进编辑页的粘贴框，或者先跑标书分析）：");
    for (const { tender, why } of stuck) {
      console.log(`  ${tender.slug}  —— ${why}`);
      console.log(`    ${tender.source_url ?? "（没有来源链接）"}`);
    }
  }

  if (!shouldWrite) {
    console.log("\n空跑（加 --write 才会写库）——什么都没改。");
    return;
  }

  let written = 0;
  for (const { tender, date } of fillable) {
    const { error } = await supabase.from("tenders").update({ submission_deadline: date }).eq("id", tender.id);
    if (error) {
      console.error(`  ${tender.slug} 写入失败：${error.message}`);
      continue;
    }
    // All three, not just the one that changed: the sync clears the mirror
    // rows of every type it owns before rebuilding, so omitting a column that
    // has a value would delete its row and put nothing back.
    await syncKeyDatesForTopLevelFields(supabase, tender.id, {
      publicationDate: tender.publication_date,
      submissionDeadline: date,
      awardDate: tender.award_date,
    });
    written += 1;
  }
  console.log(`\n已写入 ${written} 个项目的交标截止日，并同步了关键日期时间线。`);
}

main();
