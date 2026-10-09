"use client";

import { useState } from "react";
import type { TranslateAllTendersResult } from "@/lib/ingestion/translate-all-tenders";
import type { GenerateDisplayTextResult } from "@/lib/ingestion/generate-public-titles";

/**
 * 更新项目文案 — the 翻译所有标题 and 生成公开文案 panels, merged into one
 * button (user, 2026-09-20: 能不能做在一起).
 *
 * ── Two requests, not one ────────────────────────────────────────────────
 *
 * The button is one; the calls are still the two existing endpoints, fired in
 * order from here. That is deliberate, and it is what makes merging safe:
 * /api/admin/public-titles' own header argues against chaining the passes
 * inside one request, because that "would double the wall time of a request
 * that already has to stay under a proxy timeout". Sequencing on the client
 * doubles nothing — each request is exactly as long as it is today.
 *
 * It also satisfies the ordering dependency better than an in-process chain
 * would. The second pass reads its rows back out of Supabase, so it needs the
 * first pass's writes to have COMMITTED, not merely to have been issued; a
 * separate request cannot start until they have.
 *
 * ── Why the order is not the admin's job any more ────────────────────────
 *
 * The passes are not interchangeable and never were: 生成公开文案 skips any
 * row whose title.zh still equals title.es, so running it before the
 * translation silently does nothing for exactly the rows that just arrived.
 * The page said so in prose and the buttons let you do it anyway. Now the
 * sequence is the only sequence available.
 *
 * ── The one behaviour change ─────────────────────────────────────────────
 *
 * The two panels had OPPOSITE write defaults. 翻译所有标题 defaulted to
 * checked, per an explicit instruction (2026-09-04: 写入 Supabase 全部预设勾
 * 选，要预览再取消勾选); 生成公开文案 defaulted to unchecked, on the
 * reasoning that it writes the strings every public page renders and the
 * cheapest moment to catch a bad prompt is before the write.
 *
 * One control cannot hold both, so this follows the explicit instruction and
 * defaults to CHECKED. The reasoning behind the other default has also
 * weakened since it was written: every generated value is validated before
 * it is written, a refused one is never stored, and the pass is now
 * self-healing — a value that stops passing is regenerated, or cleared, on
 * the next run. Unchecking still previews BOTH passes, and the confirm dialog
 * names both.
 */
export function RefreshDisplayTextButton() {
  const [translateLimit, setTranslateLimit] = useState("20");
  const [generateLimit, setGenerateLimit] = useState("100");
  const [write, setWrite] = useState(true);
  const [stage, setStage] = useState<"idle" | "translating" | "generating">("idle");
  /** Rows finished so far in the current step, across its rounds — shown on the button. */
  const [stepDone, setStepDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<TranslateAllTendersResult | null>(null);
  const [generated, setGenerated] = useState<GenerateDisplayTextResult | null>(null);

  const submitting = stage !== "idle";

  async function run() {
    if (
      write &&
      !confirm(
        `确定要跑这两步吗？\n\n① 翻译最多 ${translateLimit || "全部"} 条还没翻译的标题/摘要\n② 为最多 ${generateLimit || "全部"} 条项目生成短标题、访客标题和访客摘要\n\n两步都会调用 DashScope（Qwen）API，产生真实费用。`,
      )
    ) {
      return;
    }

    setError(null);
    setTranslated(null);
    setGenerated(null);

    const count = (value: string) => (value.trim() === "" ? undefined : Number(value));

    try {
      setStage("translating");
      setStepDone(0);
      const translateLimitCount = count(translateLimit);
      let translatedSoFar: TranslateAllTendersResult | null = null;
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const limit = remaining(translateLimitCount, translatedSoFar?.attemptedCount);
        const translateRes = await fetch("/api/admin/translate-tenders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ write, limit }),
        });
        const translateData = await readJson(translateRes, "翻译");
        if (!translateRes.ok) throw new Error(`翻译这一步失败：${translateData.error ?? `HTTP ${translateRes.status}`}`);
        const roundResult = translateData as TranslateAllTendersResult;
        translatedSoFar = translatedSoFar ? mergeTranslate(translatedSoFar, roundResult) : roundResult;
        setTranslated(translatedSoFar);
        setStepDone(translatedSoFar.attemptedCount);
        // Another round only when this one stopped at its time budget AND
        // wrote something: rows that fail every time must not loop forever.
        if (!write || !roundResult.leftForNextRun || !roundResult.translatedCount) break;
        if (limit !== undefined && roundResult.attemptedCount >= limit) break;
      }

      // Only after the first request has RETURNED. The second pass re-reads
      // the rows from Supabase, so it sees what step ① just wrote.
      setStage("generating");
      setStepDone(0);
      const generateCount = count(generateLimit);
      let generatedSoFar: GenerateDisplayTextResult | null = null;
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const limit = remaining(generateCount, generatedSoFar?.attemptedCount);
        const generateRes = await fetch("/api/admin/public-titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(write ? { write: true, limit } : { write: false, sample: generateCount ?? 20 }),
        });
        const generateData = await readJson(generateRes, "生成公开文案");
        if (!generateRes.ok) throw new Error(`生成公开文案这一步失败：${generateData.error ?? `HTTP ${generateRes.status}`}`);
        const roundResult = generateData as GenerateDisplayTextResult;
        generatedSoFar = generatedSoFar ? mergeGenerate(generatedSoFar, roundResult) : roundResult;
        setGenerated(generatedSoFar);
        setStepDone(generatedSoFar.attemptedCount);
        if (!write || !roundResult.leftForNextRun || !roundResult.writtenCount) break;
        if (limit !== undefined && roundResult.attemptedCount >= limit) break;
      }
    } catch (err) {
      // Whatever the earlier step already returned stays on screen. A run that
      // translated 20 rows and then lost the API did real work, and hiding it
      // would send the admin back to re-translate rows that are already done.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Qwen3.7-Plus</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">更新项目文案</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        导入新数据之后跑这一个按钮，它<strong>按顺序做两步</strong>：
      </p>
      <ol className="mt-2 flex flex-col gap-2 text-sm text-[#52636e]">
        <li>
          <strong>① 翻译标题和摘要</strong>——对还没有真实中文的标书（跳过日常服务类），把标题/摘要翻成中文。
          <strong>西语和葡语各走各的提示词，按国家自动分流</strong>（巴西 = 葡语，其余 = 西语）。
          <strong>只动没翻译过的行</strong>：中文与原文逐字节相同才算没翻译，你手改钉住的字段永远跳过。
        </li>
        <li>
          <strong>② 生成公开文案</strong>——一次调用生成三段文本：订阅用户的<strong>短标题</strong>（去掉「公开招标第X号」这类壳，保留地名和括号原文）、访客的<strong>标题</strong>和<strong>摘要</strong>（去掉地名、机构名和一切编号）。完整翻译不会被改动，只是不再展示在前台。
        </li>
      </ol>
      <p className="mt-2 text-sm text-[#52636e]">
        顺序不能反：第②步会跳过还没翻译的行，所以单独先跑它，对刚导入的项目等于什么都没做。两步都按<strong>导入时间</strong>倒序取，所以「100」= 最近新增的 100 条。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">① 翻译最多几条（留空 = 全部）</span>
          <input
            type="number"
            min={1}
            value={translateLimit}
            onChange={(e) => setTranslateLimit(e.target.value)}
            className="h-10 w-32 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">② 生成最多几条（留空 = 全部）</span>
          <input
            type="number"
            min={1}
            value={generateLimit}
            onChange={(e) => setGenerateLimit(e.target.value)}
            className="h-10 w-32 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          真正写入（不勾选两步都只预览，不写库）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="mb-0.5 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {stage === "translating"
            ? `① 翻译中…${stepDone > 0 ? `（已处理 ${stepDone} 条）` : ""}`
            : stage === "generating"
              ? `② 生成公开文案中…${stepDone > 0 ? `（已处理 ${stepDone} 条）` : ""}`
              : write
                ? "开始"
                : "预览"}
        </button>
      </div>

      {/*
        Each pass keeps its own counts under its own heading, rather than
        being summed. /api/admin/public-titles' header names exactly this
        risk: the two select DIFFERENT rows — one takes tenders with no
        Chinese translation, the other takes translated tenders with no
        generated display text — so a merged total would be a number that
        answers no question either pass was asked.
      */}
      {translated && <TranslateResult result={translated} />}
      {generated && <GenerateResult result={generated} />}
    </div>
  );
}

/**
 * Each request stops starting batches after two minutes so it answers inside
 * the host's five (see the two routes). The panel then asks again by itself,
 * so one press still does the whole job (user, 2026-09-29: 现在限制时间效率很
 * 低，之前都是一次翻译好). This caps the rounds of one step.
 */
const MAX_ROUNDS = 20;

/** What is left of the admin's limit after `done` rows; undefined = no limit. */
function remaining(limit: number | undefined, done: number | undefined): number | undefined {
  return limit === undefined ? undefined : Math.max(limit - (done ?? 0), 0);
}

function sumCounts<K extends string>(a: Record<K, number> | undefined, b: Record<K, number> | undefined): Record<K, number> | undefined {
  if (!a || !b) return a ?? b;
  const sum = { ...a };
  for (const key of Object.keys(b) as K[]) sum[key] = (sum[key] ?? 0) + b[key];
  return sum;
}

/** Rounds of step ① shown as one run: the first round's totals, everything else added up, the last round's remainder. */
function mergeTranslate(a: TranslateAllTendersResult, b: TranslateAllTendersResult): TranslateAllTendersResult {
  const byLanguage = new Map(a.attemptedByLanguage.map((row) => [row.language, { ...row }]));
  for (const row of b.attemptedByLanguage) {
    const earlier = byLanguage.get(row.language);
    if (earlier) earlier.count += row.count;
    else byLanguage.set(row.language, { ...row });
  }
  return {
    ...a,
    attemptedCount: a.attemptedCount + b.attemptedCount,
    attemptedByLanguage: [...byLanguage.values()],
    translatedCount: (a.translatedCount ?? 0) + (b.translatedCount ?? 0),
    failedCount: (a.failedCount ?? 0) + (b.failedCount ?? 0),
    // A row that failed in one round and was written in a later one is not a failure.
    failedSlugs: [...(a.failedSlugs ?? []), ...(b.failedSlugs ?? [])].filter((slug) => !b.writtenSlugs?.includes(slug)),
    writtenSlugs: [...(a.writtenSlugs ?? []), ...(b.writtenSlugs ?? [])],
    droppedIdentifiers: [...(a.droppedIdentifiers ?? []), ...(b.droppedIdentifiers ?? [])],
    lastErrorMessage: b.lastErrorMessage ?? a.lastErrorMessage,
    leftForNextRun: b.leftForNextRun,
  };
}

/** Rounds of step ② shown as one run, as mergeTranslate. */
function mergeGenerate(a: GenerateDisplayTextResult, b: GenerateDisplayTextResult): GenerateDisplayTextResult {
  return {
    ...a,
    attemptedCount: a.attemptedCount + b.attemptedCount,
    writtenCount: (a.writtenCount ?? 0) + (b.writtenCount ?? 0),
    writtenByColumn: sumCounts(a.writtenByColumn, b.writtenByColumn),
    clearedByColumn: sumCounts(a.clearedByColumn, b.clearedByColumn),
    rejected: [...(a.rejected ?? []), ...(b.rejected ?? [])],
    failedSlugs: [...(a.failedSlugs ?? []), ...(b.failedSlugs ?? [])],
    lastErrorMessage: b.lastErrorMessage ?? a.lastErrorMessage,
    leftForNextRun: b.leftForNextRun,
  };
}

/**
 * The response body as JSON, or a plain explanation when the host answered
 * with its own error page instead — which is what a request cut off at the
 * time limit gets, and which JSON.parse turned into "Unexpected token 'A'"
 * (2026-09-28).
 */
async function readJson(response: Response, step: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      response.status === 504 || /timeout|timed out|An error occurred/i.test(text)
        ? `「${step}」这一步超时被服务器中断（已完成的部分已保存）。请把条数调小一些再点一次。`
        : `「${step}」这一步服务器返回异常（HTTP ${response.status}）。请稍后再试。`,
    );
  }
}

function StageHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-[#8b969c]">{children}</p>;
}

function TranslateResult({ result }: { result: TranslateAllTendersResult }) {
  return (
    <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
      <StageHeading>① 翻译标题和摘要</StageHeading>
      <p>
        共 {result.totalNonExcluded} 条非日常服务类标书，其中 {result.untranslatedCount} 条还没翻译，本次尝试 {result.attemptedCount} 条。
      </p>
      {/*
        Which prompt each row went through. A Brazilian title translated by the
        Spanish prompt comes back fluent and plausible — there is nothing in
        the Chinese itself to review. This line is the only place the routing
        is visible.
      */}
      {result.attemptedByLanguage.length > 0 && (
        <p className="mt-1 text-xs text-[#64717c]">
          按原文语种：{result.attemptedByLanguage.map((row) => `${row.label} ${row.count} 条`).join("、")}
        </p>
      )}
      {result.translatedCount !== undefined && (
        <p className="mt-1 font-semibold text-emerald-700">
          已翻译 {result.translatedCount} 条{result.failedCount ? `，失败 ${result.failedCount} 条` : ""}
        </p>
      )}
      {result.failedSlugs && result.failedSlugs.length > 0 && (
        <p className="mt-1 text-xs text-red-700">失败：{result.failedSlugs.join("、")}</p>
      )}
      {result.leftForNextRun ? <LeftForNextRun count={result.leftForNextRun} /> : null}
    </div>
  );
}

/** A run that stopped at its time budget: what it did is saved; the rest needs another press. */
function LeftForNextRun({ count }: { count: number }) {
  return <p className="mt-1 text-xs font-semibold text-[#8a5700]">为避免超时，本次先处理到这里，还剩 {count} 条，再点一次「开始」继续。</p>;
}

const COLUMN_LABELS: Record<string, string> = {
  title_zh_short: "订阅用户短标题",
  title_zh_public: "访客标题",
  summary_zh_public: "访客摘要",
};

function GenerateResult({ result }: { result: GenerateDisplayTextResult }) {
  return (
    <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
      <StageHeading>② 生成公开文案</StageHeading>
      <p>还没有生成公开文案的项目：{result.candidateCount} 条，本次处理 {result.attemptedCount} 条。</p>
      {result.leftForNextRun ? <LeftForNextRun count={result.leftForNextRun} /> : null}

      {result.preview && (
        <div className="mt-3 flex flex-col gap-3">
          {result.preview.map((row) => (
            <div key={row.slug} className="rounded-xl border border-[#e5e9eb] bg-white px-3 py-2.5">
              <p className="text-xs text-[#8a959c]">翻译原文（不展示，仅留库）：{row.titleZh}</p>
              {([
                ["订阅用户标题", row.short],
                ["访客标题", row.publicTitle],
                ["访客摘要", row.publicSummary],
              ] as const).map(([label, field]) => (
                <p key={label} className="mt-1.5 text-[13px] leading-5">
                  <span className="mr-2 font-bold text-[#52636e]">{label}</span>
                  <span className="text-[#071826]">{field.value}</span>
                  {field.problems.length > 0 && (
                    <span className="ml-2 text-xs font-semibold text-red-700">✗ {field.problems.join("；")}</span>
                  )}
                </p>
              ))}
            </div>
          ))}
          {/*
            Per field, not per row. A prompt can be fine on two of the three
            and broken on the last, and a single blended percentage hides
            exactly that.
          */}
          <p className="text-xs text-[#64717c]">
            可发布：
            {([
              ["订阅标题", (r: NonNullable<typeof result.preview>[number]) => r.short.problems],
              ["访客标题", (r: NonNullable<typeof result.preview>[number]) => r.publicTitle.problems],
              ["访客摘要", (r: NonNullable<typeof result.preview>[number]) => r.publicSummary.problems],
            ] as const)
              .map(([label, pick]) => `${label} ${result.preview!.filter((r) => pick(r).length === 0).length}/${result.preview!.length}`)
              .join("、")}
            。任何一项低于九成，先别勾选写入。
          </p>
        </div>
      )}

      {result.writtenCount !== undefined && (
        <p className="mt-1 font-semibold text-emerald-700">
          已写入 {result.writtenCount} 行
          {result.writtenByColumn
            ? `（${Object.entries(result.writtenByColumn).map(([column, count]) => `${COLUMN_LABELS[column] ?? column} ${count} 条`).join("、")}）`
            : ""}
        </p>
      )}

      {Object.values(result.clearedByColumn ?? {}).some((count) => count > 0) && (
        <p className="mt-1 text-[#8a5a00]">
          清空了 {Object.values(result.clearedByColumn ?? {}).reduce((sum, count) => sum + count, 0)} 条不再合规的存量文案
          （已回落到默认文案，下次运行会重试）
        </p>
      )}
      {result.rejected && result.rejected.length > 0 && (
        <div className="mt-2 text-xs text-[#a5560b]">
          <p className="font-semibold">被拒绝 {result.rejected.length} 项（该列保持为空，沿用回退值）：</p>
          {result.rejected.slice(0, 10).map((row) => (
            <p key={`${row.slug}-${row.column}`} className="mt-0.5">
              {row.slug} · {COLUMN_LABELS[row.column] ?? row.column}：{row.value} —— {row.problems.join("；")}
            </p>
          ))}
          {result.rejected.length > 10 && <p className="mt-0.5">…另有 {result.rejected.length - 10} 项</p>}
        </div>
      )}

      {result.failedSlugs && result.failedSlugs.length > 0 && (
        <p className="mt-1 text-xs text-red-700">模型没有返回或写入失败：{result.failedSlugs.join("、")}</p>
      )}

      {result.lastErrorMessage && <p className="mt-1 text-xs text-red-700">最近一次错误：{result.lastErrorMessage}</p>}
    </div>
  );
}
