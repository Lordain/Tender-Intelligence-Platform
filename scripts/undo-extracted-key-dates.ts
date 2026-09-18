/**
 * Removes the schedule a document re-read added to a tender whose schedule a
 * human had already entered.
 *
 * The companion to the rule added the same day in lib/db/extracted-key-dates.ts:
 * that stops new ones arriving, this clears the ones already written. The
 * 本地批量分析 run of 2026-09-16 put a document's cronograma onto tenders whose
 * key dates were hand-entered, and on at least one of them the document's
 * schedule was an EARLIER round of the same procedure — a March–May timeline
 * sitting beside the real September–October one, with two 现场踏勘 and two
 * 提问截止 on the public page.
 *
 * What it deletes: `extracted_from_document` rows, and only on a tender that
 * also has at least one `manually_added` row. A tender nobody entered dates
 * for keeps its extracted schedule — that is the population the extraction
 * exists for, and it is the only schedule those tenders have.
 *
 * What it does NOT touch: `submission_deadline` on the tender row. The
 * extraction only ever fills that column when it was empty, so clearing it
 * would delete the only deadline some of these tenders have, and nothing
 * stored says whether the current value came from here or from the feed. Any
 * tender where the column disagrees with the human's own 交标 row is printed
 * instead, for a person to settle in the key-dates editor.
 *
 * Dry run by default, like every purge script here.
 *
 * Usage:
 *   npm run undo:extracted-key-dates                      (dry run — prints both schedules per tender)
 *   npm run undo:extracted-key-dates -- --write           (deletes the extracted rows)
 *   npm run undo:extracted-key-dates -- --slug a --slug b (only these tenders)
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { KEY_DATE_TYPE_LABELS } from "../lib/tender-labels";
import type { TenderKeyDate } from "../types/tender";
import { hasWriteFlag } from "@/lib/cli-write-flag";

type Row = {
  id: string;
  tender_id: string;
  type: TenderKeyDate["type"];
  date: string;
  extracted_from_document: boolean;
  manually_added: boolean;
};

type TenderRow = { id: string; slug: string; submission_deadline: string | null };

function slugsFromArgv(): string[] {
  const slugs: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--slug" && process.argv[i + 1]) slugs.push(process.argv[i + 1]);
  }
  return slugs;
}

function label(type: TenderKeyDate["type"]): string {
  return KEY_DATE_TYPE_LABELS[type]?.zh ?? type;
}

async function main() {
  const shouldWrite = hasWriteFlag();
  const onlySlugs = slugsFromArgv();

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase 没有配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），见 .env.example");
    process.exit(1);
  }

  let tenderQuery = supabase.from("tenders").select("id, slug, submission_deadline");
  if (onlySlugs.length > 0) tenderQuery = tenderQuery.in("slug", onlySlugs);
  const { data: tenders, error: tenderError } = await tenderQuery.returns<TenderRow[]>();
  if (tenderError) throw new Error(`读取 tenders 失败：${tenderError.message}`);

  const bySlug = new Map((tenders ?? []).map((row) => [row.id, row]));

  const { data: keyDates, error: keyDateError } = await supabase
    .from("tender_key_dates")
    .select("id, tender_id, type, date, extracted_from_document, manually_added")
    .in("tender_id", [...bySlug.keys()])
    .returns<Row[]>();
  if (keyDateError) throw new Error(`读取 tender_key_dates 失败：${keyDateError.message}`);

  const perTender = new Map<string, Row[]>();
  for (const row of keyDates ?? []) {
    const list = perTender.get(row.tender_id) ?? [];
    list.push(row);
    perTender.set(row.tender_id, list);
  }

  const doomed: Row[] = [];
  let affected = 0;

  for (const [tenderId, rows] of perTender) {
    const manual = rows.filter((row) => row.manually_added);
    const extracted = rows.filter((row) => row.extracted_from_document);
    if (manual.length === 0 || extracted.length === 0) continue;

    const tender = bySlug.get(tenderId);
    affected += 1;
    doomed.push(...extracted);

    console.log(`\n${tender?.slug ?? tenderId}`);
    console.log(`  人工录入 ${manual.length} 条：${manual.map((r) => `${label(r.type)} ${r.date}`).sort().join("，")}`);
    console.log(`  标书提取 ${extracted.length} 条（要删）：${extracted.map((r) => `${label(r.type)} ${r.date}`).sort().join("，")}`);

    const manualSubmission = manual.find((row) => row.type === "submission")?.date;
    const storedDay = tender?.submission_deadline?.slice(0, 10);
    if (manualSubmission && storedDay && manualSubmission !== storedDay) {
      console.log(`  ⚠ 项目上的交标截止日是 ${storedDay}，但人工录入的是 ${manualSubmission} —— 请在后台核对，本脚本不改这个字段`);
    }
  }

  console.log(`\n共 ${perTender.size} 个项目有日程，其中 ${affected} 个同时有人工和标书日程，涉及 ${doomed.length} 条标书提取的日期`);

  if (doomed.length === 0) return;
  if (!shouldWrite) {
    console.log("\n这是试运行，什么都没删。确认上面的清单之后加 --write。");
    return;
  }

  const { error: deleteError } = await supabase.from("tender_key_dates").delete().in("id", doomed.map((row) => row.id));
  if (deleteError) throw new Error(`删除失败：${deleteError.message}`);
  console.log(`已删除 ${doomed.length} 条标书提取的日期。人工录入的日程原样保留。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
