/**
 * Measures how often the bid deadline a model reads out of a tender document
 * matches the official one — the number this platform has never had.
 *
 * Why it is needed. #31 built cronograma extraction and #34 validated it on
 * real data for the first time on 2026-09-14, but what got validated was a
 * QUESTIONS deadline: the tender's 提问截止 came out of the bid document as
 * 2026-09-21 and the SEACE ficha said 2026-09-21. That is encouraging and it
 * is not the field anyone acts on. `submission_deadline` drives 已截止 on the
 * public site and drives the digest email; a wrong one either hides a live
 * tender or holds an expired one open. Its accuracy was still a belief.
 *
 * Why it can be measured for free, in the sense that costs no human lookup.
 * writeExtractedKeyDates() fills that column only when it is EMPTY, so every
 * tender whose column is already filled has been quietly carrying a second
 * opinion nobody compared: the source's date, and the document's. Running the
 * same extraction with write:false and comparing the two turns that into a
 * score. No official page has to be opened by hand for a single one of them.
 *
 * What counts as ground truth, and why the bar is this high. Only two kinds
 * of stored deadline can score an extraction:
 *
 *   1. The tender has NO tender_documents row at all. Then no document
 *      extraction has ever run on it, so its deadline came from the source
 *      feed — structured data an entity published as a field.
 *   2. A key date of type `submission` carries the cronograma paste's own
 *      source reference, i.e. an admin read it off the official ficha page.
 *
 * Anything else is excluded, and the exclusion matters more than the
 * inclusion: a deadline that a PREVIOUS run of this very extraction wrote
 * would score the model against itself and return 100% while proving
 * nothing. That is the failure mode this script exists to avoid, so it
 * refuses the sample rather than reporting a flattering number.
 *
 * Nothing is written. Every call is write:false — the analysis is discarded
 * after being compared.
 *
 * Usage:
 *   npm run measure:deadlines -- ./docs                 (free: lists the scorable tenders, calls nothing)
 *   npm run measure:deadlines -- ./docs --run           (spends: analyses them and prints the score)
 *   npm run measure:deadlines -- ./docs --run --limit=3 (spends less)
 *
 * The default is deliberately the free one. A run over a full folder is real
 * money, and the candidate list is the part worth reading first anyway — if
 * it comes back with two scorable tenders, the measurement is not worth
 * paying for yet.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { analyzeUploadedDocument } from "../lib/ingestion/analyze-uploaded-document";
import { findDocuments, loadKnownTenders, resolveTender } from "../lib/ingestion/match-documents-to-tenders";
import { runPool } from "../lib/ingestion/run-pool";
import { ANALYSIS_CONCURRENCY } from "../lib/ingestion/extraction-failure";
import { CRONOGRAMA_SOURCE_REFERENCE } from "../lib/ingestion/seace-cronograma";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

type Candidate = {
  slug: string;
  files: string[];
  storedDeadline: string;
  /** Why this stored date is allowed to judge the model. */
  truthSource: "数据源字段" | "官方 ficha（人工粘贴）";
};

type Scored = Candidate & {
  extractedDeadline?: string;
  extractedCount: number;
  verdict: "一致" | "偏差" | "标书未载明" | "分析失败";
  offByDays?: number;
  note?: string;
};

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime()) / 86_400_000);
}

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith("--"));
  const run = args.includes("--run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  if (!folder) {
    console.error("用法：npm run measure:deadlines -- <文件夹> [--run] [--limit=N]");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），见 .env.example。");
    process.exit(1);
  }

  const files = findDocuments(folder);
  console.log(`在 ${folder} 找到 ${files.length} 个文件，正在匹配项目…\n`);

  const byTender = new Map<string, string[]>();
  const known = await loadKnownTenders(supabase);
  for (const file of files) {
    const resolved = await resolveTender(supabase, file, known);
    if ("skip" in resolved) continue;
    const group = byTender.get(resolved.tender.slug);
    if (group) group.push(file);
    else byTender.set(resolved.tender.slug, [file]);
  }

  // Work out which of those tenders can actually judge an extraction.
  const candidates: Candidate[] = [];
  const excluded: { slug: string; reason: string }[] = [];

  for (const [slug, group] of byTender) {
    const { data: tender } = await supabase
      .from("tenders")
      .select("id, submission_deadline")
      .eq("slug", slug)
      .maybeSingle();
    if (!tender) {
      excluded.push({ slug, reason: "项目不存在" });
      continue;
    }
    const storedDeadline = (tender.submission_deadline as string | null)?.slice(0, 10) ?? null;
    if (!storedDeadline) {
      excluded.push({ slug, reason: "没有交标截止日，无法判分（这类项目正是提取要去填的，但填得对不对无从比对）" });
      continue;
    }

    const { data: fichaRow } = await supabase
      .from("tender_key_dates")
      .select("id")
      .eq("tender_id", tender.id)
      .eq("type", "submission")
      .eq("source_reference", CRONOGRAMA_SOURCE_REFERENCE)
      .maybeSingle();

    if (fichaRow) {
      candidates.push({ slug, files: group, storedDeadline, truthSource: "官方 ficha（人工粘贴）" });
      continue;
    }

    // No ficha row: the date is only trustworthy if document extraction has
    // never run on this tender, since that is the one thing that could have
    // written it from a document.
    const { count } = await supabase
      .from("tender_documents")
      .select("id", { count: "exact", head: true })
      .eq("tender_id", tender.id);

    if ((count ?? 0) > 0) {
      excluded.push({
        slug,
        reason: `已有 ${count} 份文档分析记录，交标截止日可能就是提取自己写的——拿它判分等于自己考自己，排除`,
      });
      continue;
    }
    candidates.push({ slug, files: group, storedDeadline, truthSource: "数据源字段" });
  }

  console.log(`可判分的项目：${candidates.length} 个`);
  for (const candidate of candidates) {
    console.log(`  ${candidate.slug}  官方日期 ${candidate.storedDeadline}（${candidate.truthSource}）  ${candidate.files.length} 个文件`);
  }
  if (excluded.length > 0) {
    console.log(`\n排除 ${excluded.length} 个：`);
    for (const item of excluded) console.log(`  ${item.slug} —— ${item.reason}`);
  }

  const toRun = candidates.slice(0, limit === Infinity ? candidates.length : limit);
  if (!run) {
    console.log(`\n这是免费的清点，没有调用任何模型。`);
    console.log(`加 --run 才会真正分析（会调用 ${toRun.length} 次模型，产生费用）。`);
    return;
  }
  if (toRun.length === 0) {
    console.log("\n没有可判分的项目，不调用模型。");
    return;
  }

  console.log(`\n开始分析 ${toRun.length} 个项目（并发 ${ANALYSIS_CONCURRENCY}，只读不写）…\n`);
  const scored: Scored[] = new Array(toRun.length);
  const startedAt = Date.now();

  await runPool(toRun, ANALYSIS_CONCURRENCY, async (candidate, index) => {
    try {
      const buffers = candidate.files.map((file) => ({ buffer: readFileSync(file), fileName: basename(file) }));
      const result = await analyzeUploadedDocument(supabase, candidate.slug, buffers, { write: false, force: false });
      const extracted = result.extractedKeyDates.find((item) => item.type === "submission")?.date;
      if (!extracted) {
        scored[index] = { ...candidate, extractedCount: result.keyDates, verdict: "标书未载明" };
      } else if (extracted === candidate.storedDeadline) {
        scored[index] = { ...candidate, extractedDeadline: extracted, extractedCount: result.keyDates, verdict: "一致" };
      } else {
        scored[index] = {
          ...candidate,
          extractedDeadline: extracted,
          extractedCount: result.keyDates,
          verdict: "偏差",
          offByDays: daysBetween(extracted, candidate.storedDeadline),
        };
      }
      console.log(`  ${candidate.slug}  ${scored[index].verdict}${scored[index].offByDays !== undefined ? `（${scored[index].offByDays} 天）` : ""}`);
    } catch (err) {
      scored[index] = {
        ...candidate,
        extractedCount: 0,
        verdict: "分析失败",
        note: err instanceof Error ? err.message : String(err),
      };
      console.log(`  ${candidate.slug}  分析失败：${scored[index].note}`);
    }
  });

  const agree = scored.filter((s) => s.verdict === "一致");
  const off = scored.filter((s) => s.verdict === "偏差");
  const silent = scored.filter((s) => s.verdict === "标书未载明");
  const failed = scored.filter((s) => s.verdict === "分析失败");
  const judged = agree.length + off.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
  console.log(`标书里给出了交标截止日：${judged} / ${scored.length}`);
  if (judged > 0) {
    console.log(`  其中与官方一致：${agree.length}（${((agree.length / judged) * 100).toFixed(0)}%）`);
    console.log(`  其中有偏差：    ${off.length}`);
    for (const item of off) {
      console.log(`    ${item.slug}：标书 ${item.extractedDeadline}，官方 ${item.storedDeadline}，差 ${item.offByDays} 天`);
    }
  }
  console.log(`标书未载明（没给日期）：${silent.length}`);
  for (const item of silent) console.log(`    ${item.slug}（提取到 ${item.extractedCount} 条其他日程）`);
  if (failed.length > 0) {
    console.log(`分析失败：${failed.length}`);
    for (const item of failed) console.log(`    ${item.slug}：${item.note}`);
  }

  // The interpretation, stated here rather than left to whoever reads it.
  console.log("");
  if (judged === 0) {
    console.log("没有一份标书给出交标截止日——对这批来源来说，提取不是准确率问题，是覆盖率为零。");
  } else if (off.length === 0) {
    console.log(`${judged} 份标书给出了日期，全部与官方一致。`);
  } else {
    const monthOff = off.filter((item) => Math.abs(item.offByDays ?? 0) >= 28 && Math.abs(item.offByDays ?? 0) <= 31);
    console.log(`${off.length} 份与官方不一致——每一份都要看清是标书补遗改了日期，还是读错了。`);
    if (monthOff.length > 0) {
      console.log(`其中 ${monthOff.length} 份差了约一个月，这是 DD/MM 被读成 MM/DD 的典型特征，优先查这几份。`);
    }
  }

  console.log("\n（全程 write:false，没有修改任何项目。）");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
