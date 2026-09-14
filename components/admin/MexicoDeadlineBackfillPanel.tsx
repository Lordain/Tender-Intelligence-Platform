"use client";

import { useState } from "react";
import type { BackfillResult } from "@/lib/ingestion/backfill-mexico-deadlines";

const day = (value: string | null | undefined) => value?.slice(0, 10) ?? "—";

/**
 * Web-form counterpart to `npm run backfill:mx-deadlines`, on the 墨西哥 tab
 * because the rule it applies is Mexican law (see
 * lib/ingestion/mexico-opening-deadline.ts) — unlike the cross-country
 * actions on the 维护 tab.
 *
 * Shows every tender it looked at, not just a count: what makes this safe is
 * that the admin can see WHICH date it wants to copy and where that date
 * came from, before anything is written.
 */
export function MexicoDeadlineBackfillPanel() {
  const [write, setWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);

  async function run() {
    if (write && !confirm("确定要把这些项目的开标日期写成交标截止日吗？只会填当前为空的，不会覆盖已有日期。")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/backfill-mx-deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as BackfillResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Mexico</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">补交标截止日</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        墨西哥的招标是<strong>递交和开标同一场</strong>（acto de presentación y apertura de proposiciones），所以项目已有的开标日期就是交标截止日。这个操作把缺日期的墨西哥项目按这条规则补齐，
        <strong>只填空的，不覆盖任何已有日期</strong>。
        商务标开标（apertura económica）是交标之后的第二场，一律不会被当成截止日——这类项目会被列为&ldquo;填不了&rdquo;，需要人工确认。
      </p>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <label className="mt-4 flex items-center gap-2 border-t border-[#e5e9eb] pt-4 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(event) => setWrite(event.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览，不会真的改数据库）
      </label>
      <button
        type="button"
        onClick={run}
        disabled={submitting}
        className="mt-4 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "运行中…" : write ? "补齐并写入" : "预览"}
      </button>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            {result.totalMissing} 个墨西哥项目没有交标截止日：{result.fillableCount} 个可填，{result.stuckCount} 个填不了。
          </p>
          {result.write && (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.writtenCount} 条{result.failedCount > 0 ? `，${result.failedCount} 条失败` : ""}。
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {result.candidates.map((candidate) => (
              <li key={candidate.slug} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <p className="font-bold text-[#071826]">{candidate.title}</p>
                <p className="mt-0.5 text-xs text-[#8a97a0]">
                  {candidate.slug}
                  {candidate.sourceName ? ` · ${candidate.sourceName}` : ""} · 发布 {day(candidate.publicationDate)} · 标书 {candidate.documentCount} 份
                </p>
                {candidate.keyDates.length > 0 && (
                  <p className="mt-1 text-xs text-[#52636e]">
                    {candidate.keyDates.map((row) => `${day(row.date)} ${row.label || row.type}`).join("　·　")}
                  </p>
                )}
                {candidate.fill ? (
                  <p className="mt-1 text-sm font-semibold text-emerald-700">
                    可填 {day(candidate.fill.date)}（依据：{candidate.fill.basis}）
                    {candidate.outcome === "written" ? " ✓ 已写入" : ""}
                    {candidate.outcome === "failed" ? ` ✗ ${candidate.error}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-[#b86e00]">
                    填不了：
                    {candidate.blocked === "economic_only"
                      ? "只有商务标开标，那是交标之后的第二场"
                      : "没有开标日期可依据"}
                    {candidate.sourceUrl && (
                      <>
                        {" · "}
                        <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                          打开来源 ↗
                        </a>
                      </>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
