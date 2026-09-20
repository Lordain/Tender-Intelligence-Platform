"use client";

import { useState } from "react";
import type { GenerateDisplayTextResult } from "@/lib/ingestion/generate-public-titles";

const COLUMN_LABELS: Record<string, string> = {
  title_zh_short: "订阅用户短标题",
  title_zh_public: "访客标题",
  summary_zh_public: "访客摘要",
};

export function GeneratePublicTextButton() {
  const [limit, setLimit] = useState("100");
  // Defaults to UNCHECKED, unlike 翻译所有标题 next to it. That one writes a
  // translation an admin can read and fix later; this one writes the strings
  // every public page and every list row renders, and the cheapest moment to
  // catch a bad prompt is before the write, not after.
  const [write, setWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateDisplayTextResult | null>(null);

  async function run() {
    if (write && !confirm(`确定要为最多 ${limit || "全部"} 条项目生成并写入公开文案吗？会调用 DashScope（Qwen）API 产生真实费用。`)) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const count = limit.trim() === "" ? undefined : Number(limit);
      const res = await fetch("/api/admin/public-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(write ? { write: true, limit: count } : { write: false, sample: count ?? 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as GenerateDisplayTextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Qwen3.6-Plus</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">生成公开文案</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        在<strong>翻译之后</strong>跑。一次调用生成三段文本：订阅用户看到的<strong>短标题</strong>（去掉「公开招标第X号」「详见附件」这类壳，保留地名和括号原文）、访客看到的<strong>标题</strong>和<strong>摘要</strong>（去掉地名、机构名、设施专名和一切编号）。完整翻译原文不会被改动，只是不再展示在前台。
      </p>
      <p className="mt-2 text-sm text-[#52636e]">
        按<strong>导入时间</strong>倒序取，所以「100」= 最近新增的 100 条。写入一次跑几十条比较稳——上百条会连续调用几十次 API，请求可能先超时。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">本次最多处理几条（留空 = 全部）</span>
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="h-10 w-32 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          真正生成并写入（不勾选只试生成最多 20 条给你看，不写库）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="mb-0.5 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "处理中…" : write ? "开始生成" : "试生成"}
        </button>
      </div>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>还没有生成公开文案的项目：{result.candidateCount} 条，本次处理 {result.attemptedCount} 条。</p>

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
                Per field, not per row. A prompt can be fine on two of the
                three and broken on the last, and a single blended percentage
                hides exactly that.
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
      )}
    </div>
  );
}
