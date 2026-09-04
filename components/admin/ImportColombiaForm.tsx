"use client";

import { useState } from "react";

type ImportColombiaResult = {
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  protectedCount?: number;
  skippedManuallyDeletedCount?: number;
  failed?: { slug: string; error: string }[];
  documentsCandidateTenders?: number;
  documentsDownloaded?: number;
  documentsAlreadyOnFile?: number;
  documentsFailed?: number;
  documentsMetadataRowsFound?: number;
  documentsSkippedPostAward?: number;
};

/**
 * Web-form counterpart to `npm run ingest:colombia-live` — see
 * lib/ingestion/ingest-colombia.ts for the real logic. Colombia's SECOP II
 * is genuinely automatable end-to-end (live tender list + live document
 * downloads, both confirmed real, unauthenticated Socrata endpoints — see
 * that file's header comment), unlike every Mexico source this platform
 * has, which needs either a manually captured export or is anti-bot
 * gated. One button pulls both: the tender list AND (optionally) each
 * newly-written tender's pre-award bid documents in the same run.
 */
export function ImportColombiaForm() {
  const [months, setMonths] = useState("2");
  const [maxPages, setMaxPages] = useState("20");
  // Defaults to checked per the user's explicit request (2026-09-04): "写入
  // Supabase 全部预设勾选，要预览再取消勾选" — uncheck to preview only.
  const [write, setWrite] = useState(true);
  const [fetchDocuments, setFetchDocuments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportColombiaResult | null>(null);

  async function run() {
    if (write && !confirm("确定要从 SECOP II 拉取哥伦比亚标书（和附件）并写入 Supabase 吗？这个操作可能需要几分钟，附件下载会逐条项目单独请求。")) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-colombia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          months: months.trim() === "" ? undefined : Number(months),
          maxPages: maxPages.trim() === "" ? undefined : Number(maxPages),
          write,
          fetchDocuments: write && fetchDocuments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ImportColombiaResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Colombia</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">SECOP II — 哥伦比亚标书 + 附件</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        直接从 SECOP II 官方公开接口实时拉取（不需要手动导出文件），可以同时把每条新写入项目的招标附件一并下载并记录。
      </p>
      {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">保留最近几个月发布的</span>
          <input
            type="number"
            min={0}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="h-9 w-28 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">最多拉取页数（每页 1000 条）</span>
          <input
            type="number"
            min={1}
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
            className="h-9 w-32 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览）
        </label>
        {write && (
          <label className="ml-6 flex items-center gap-2 text-xs text-[#233846]">
            <input type="checkbox" checked={fetchDocuments} onChange={(e) => setFetchDocuments(e.target.checked)} className="size-4 accent-[#ffb21c]" />
            同时下载新写入项目的招标附件（只下载未涉及合同编号的标前文件，不含已中标后的文件）
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={run}
        disabled={submitting}
        className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "运行中…" : write ? "拉取并写入" : "预览"}
      </button>

      {result && (
        <div className="mt-3 text-xs text-[#52636e]">
          <p>
            实时拉到 {result.fetchedCount} 条，成功映射 {result.mappedCount} 条，按最近 {result.months || "不限"} 个月过滤后剩 {result.keptAfterRecencyCount} 条。
          </p>
          {result.upsertedCount !== undefined && (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.upsertedCount} 条
              {result.skippedExcludedCount ? `，跳过 ${result.skippedExcludedCount} 条日常服务类` : ""}
              {result.protectedCount ? `，${result.protectedCount} 条保留人工锁定的分类` : ""}
              {result.skippedManuallyDeletedCount ? `，跳过 ${result.skippedManuallyDeletedCount} 条人工删除过的` : ""}
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败` : ""}
            </p>
          )}
          {result.documentsCandidateTenders !== undefined && (
            <p className="mt-1">
              附件：对 {result.documentsCandidateTenders} 条新写入项目逐条查询，SECOP 附件元数据接口共返回 {result.documentsMetadataRowsFound ?? 0} 条记录
              {result.documentsSkippedPostAward ? `（其中 ${result.documentsSkippedPostAward} 条因带合同编号=已中标后文件，跳过）` : ""}
              ，下载并记录 {result.documentsDownloaded ?? 0} 份
              {result.documentsAlreadyOnFile ? `（${result.documentsAlreadyOnFile} 份已存在，跳过）` : ""}
              {result.documentsFailed ? `，${result.documentsFailed} 份失败` : ""}
              {result.documentsMetadataRowsFound === 0 && !result.documentsFailed
                ? "。返回 0 条说明这批项目在附件元数据数据集里暂时查不到对应记录（可能是刚发布还没归档，也可能是 id 对不上），不是下载失败。"
                : ""}
              。文件保存在服务器本地 downloads/colombia/&lt;项目 slug&gt;/ 目录，尚未做 AI 分析——需要再用&quot;标书附件分析&quot;逐条上传分析，或用 <code>npm run extract:document</code> 处理。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
