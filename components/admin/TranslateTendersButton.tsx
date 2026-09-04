"use client";

import { useState } from "react";
import type { TranslateAllTendersResult } from "@/lib/ingestion/translate-all-tenders";

export function TranslateTendersButton() {
  const [limit, setLimit] = useState("20");
  const [write, setWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslateAllTendersResult | null>(null);

  async function run() {
    if (write && !confirm(`确定要翻译最多 ${limit || "全部"} 条标书标题吗？会调用 Anthropic API 产生真实费用。`)) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/translate-tenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write, limit: limit.trim() === "" ? undefined : Number(limit) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as TranslateAllTendersResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Haiku 4.5</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">翻译所有标题</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        对还没有真实中文标题的标书（跳过日常服务类），批量调用 Haiku 4.5 把标题/摘要从西语翻译成中文。真实调用 API，会产生费用——建议先用较小的数量试跑。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">本次最多翻译几条（留空 = 全部）</span>
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
          真正翻译并写入（不勾选只预览待翻译数量）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="mb-0.5 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "处理中…" : write ? "开始翻译" : "预览"}
        </button>
      </div>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            共 {result.totalNonExcluded} 条非日常服务类标书，其中 {result.untranslatedCount} 条还没翻译，本次尝试 {result.attemptedCount} 条。
          </p>
          {result.translatedCount !== undefined && (
            <p className="mt-1 font-semibold text-emerald-700">
              已翻译 {result.translatedCount} 条{result.failedCount ? `，失败 ${result.failedCount} 条` : ""}
            </p>
          )}
          {result.failedSlugs && result.failedSlugs.length > 0 && (
            <p className="mt-1 text-xs text-red-700">失败：{result.failedSlugs.join("、")}</p>
          )}
        </div>
      )}
    </div>
  );
}
