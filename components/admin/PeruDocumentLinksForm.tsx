"use client";

import { useState } from "react";

/**
 * Backfills official bid-document links for Peru tenders already in Supabase
 * — the button form of `npm run backfill:peru-documents`, sharing its one
 * implementation (lib/ingestion/ingest-peru.ts's backfillPeruDocumentLinks).
 *
 * Rendered only on a local dev server, because it calls SEACE and Peru's
 * proxy refuses Vercel's datacenter range; app/api/admin/peru-document-links
 * enforces that server-side rather than trusting this not to be rendered.
 *
 * Nothing here touches the tenders themselves — no reclassification, no
 * upsert, no deletion. It only fills in "where can this tender's documents be
 * downloaded from", which is what decides whether 批量下载标书 can act on a
 * row that predates the link capture.
 */
type Result = {
  segments: string[];
  recordCount: number;
  tendersWithLinks: number;
  linkCount: number;
  write: boolean;
  saved?: {
    tendersWithLinks: number;
    linkCount: number;
    unmatchedSlugs: number;
    failed: { slug: string; error: string }[];
  };
};

export function PeruDocumentLinksForm() {
  const [months, setMonths] = useState("6");
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/peru-document-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: Number(months) || 6, write }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? `HTTP ${response.status}`);
      else setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Perú · 仅本机</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">补齐历史项目的标书链接</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        SEACE 导入现在会顺手记下每条项目的官方标书下载地址，但<strong>在这之前入库的项目没有</strong>，
        「待补文件项目」页也就没法对它们一键下载。这个操作重新读一遍同样的月份段，只补链接——
        不重新分类、不改动、不删除任何项目。可以重复跑，重复的链接会自动去重。
      </p>
      <p className="mt-2 rounded-xl border border-[#f0d9a8] bg-[#fff8e9] px-3 py-2 text-xs text-[#7a5200]">
        这个面板只在本机 <code className="font-mono">npm run dev</code> 下出现——秘鲁官方接口拒绝机房 IP，线上部署跑不了。
        等价命令：<code className="font-mono">npm run backfill:peru-documents -- --months {months || 6}{write ? " --write" : ""}</code>
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">往回补几个月</span>
          <input
            type="number"
            min={1}
            max={24}
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            className="h-9 w-28 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(event) => setWrite(event.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只统计）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="mb-0.5 h-9 rounded-lg bg-[#071826] px-4 text-xs font-black text-white transition-colors hover:bg-[#12364d] disabled:opacity-50"
        >
          {running ? "运行中…（6 个月约要两分钟）" : write ? "补齐并写入" : "先统计一遍"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {result && (
        <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4 text-sm">
          <p className="font-bold text-[#071826]">
            扫描 {result.recordCount.toLocaleString()} 条记录 → 其中 {result.tendersWithLinks.toLocaleString()} 条带标书链接（共{" "}
            {result.linkCount.toLocaleString()} 份文件）
            <span className="font-normal text-[#64717c]">（月份段：{result.segments.join("、")}）</span>
          </p>
          {result.saved ? (
            <>
              <p className="mt-2 text-xs text-[#233846]">
                已写入 <strong className="text-[#b86e00]">{result.saved.linkCount.toLocaleString()}</strong> 条链接，覆盖{" "}
                <strong className="text-[#b86e00]">{result.saved.tendersWithLinks.toLocaleString()}</strong> 个已入库项目。
              </p>
              <p className="mt-1 text-xs text-[#64717c]">
                另有 {result.saved.unmatchedSlugs.toLocaleString()} 条记录有链接但库里没有对应项目——被筛掉的或不在导入窗口内的，属正常。
              </p>
              {result.saved.failed.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-red-700">
                  {result.saved.failed.slice(0, 5).map((failure) => (
                    <li key={failure.slug}>
                      {failure.slug}: {failure.error}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-[#64717c]">只统计，没有写入。勾上「写入 Supabase」再跑一次才会生效。</p>
          )}
        </div>
      )}
    </div>
  );
}
