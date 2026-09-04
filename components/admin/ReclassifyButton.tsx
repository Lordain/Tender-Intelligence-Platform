"use client";

import { useState } from "react";

type ReclassifyResult = {
  totalCount: number;
  changedCount: number;
  nowExcludedCount: number;
  nowIncludedCount: number;
  updatedCount: number;
  deletedCount: number;
  protectedSkippedCount: number;
  failedCount: number;
  keptPath: string;
  excludedPath: string;
  write: boolean;
};

/**
 * Web-form counterpart to `npm run reclassify:tenders` — per the user's
 * explicit ask (2026-09-04, "以后我每次都得用 terminal 执行 write 吗？"),
 * re-running lib/relevance.ts's ruleset against every already-ingested
 * tender no longer needs a terminal. Only needed after a relevance-rule
 * change (a new keyword, a threshold change, ...) — not a routine/frequent
 * operation, but no reason to make it terminal-only either.
 */
export function ReclassifyButton() {
  const [write, setWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReclassifyResult | null>(null);

  async function run() {
    if (write && !confirm("确定要用当前的分类规则重新计算所有已入库标书吗？被判定为「日常服务类」的标书会被直接删除。")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ReclassifyResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Maintenance</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">重新分类</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        用最新的分类规则（比如今天新加的车辆/机械白名单）重新计算所有已入库标书。只有改了分类规则本身才需要跑这个——平时导入新标书不需要。人工锁定过分类或人工删除过的标书不会被这个操作动到。
      </p>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <label className="mt-4 flex items-center gap-2 border-t border-[#e5e9eb] pt-4 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只导出 CSV 预览，不会真的改数据库）
      </label>
      <button
        type="button"
        onClick={run}
        disabled={submitting}
        className="mt-4 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "运行中…" : write ? "重新分类并写入" : "预览"}
      </button>
      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            共 {result.totalCount} 条，{result.changedCount} 条分类会变化（{result.nowExcludedCount} 条新排除，{result.nowIncludedCount} 条重新纳入）。
          </p>
          <p className="mt-1 text-xs text-[#8a97a0]">
            CSV 已导出到本机 {result.keptPath} / {result.excludedPath}
          </p>
          {result.write && (
            <p className="mt-1 font-semibold text-emerald-700">
              已更新 {result.updatedCount} 条，删除 {result.deletedCount} 条
              {result.protectedSkippedCount ? `，保留 ${result.protectedSkippedCount} 条人工锁定的分类` : ""}
              {result.failedCount ? `，${result.failedCount} 条失败` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
