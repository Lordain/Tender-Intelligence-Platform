"use client";

import { useState } from "react";
import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";
import type { SeaceListImportResult } from "@/lib/ingestion/ingest-peru-seace-list";

function money(value: number | undefined, currency: string | undefined): string {
  if (!value) return "未披露";
  return `${currency ?? ""} ${Math.round(value).toLocaleString("en-US")}`.trim();
}

/**
 * Upload for SEACE's own search export (Lista-Procesos.xls) — the manual
 * fallback while the OECE API is stale (lib/ingestion/peru-seace-list.ts).
 * Laid out like the Compras MX upload on the 墨西哥 tab.
 */
export function ImportPeruSeaceListForm() {
  const [file, setFile] = useState<File | null>(null);
  // Checked by default, like every import form here (user, 2026-09-04).
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeaceListImportResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("请先选择 SEACE 导出的 Lista-Procesos 文件。");
      return;
    }
    if (write && !confirm("确定要写入 Supabase 吗？")) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("write", String(write));
    try {
      const res = await fetch("/api/admin/import-tenders/peru-seace-list", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as SeaceListImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#e5e9eb] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64717c]">
            第一步：打开 SEACE 官方搜索页，按发布日期搜索后点导出（Exportar），下载 Lista-Procesos 文件。
          </p>
          <a
            href={SEACE_PUBLIC_SEARCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-fit shrink-0 items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm font-black text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
          >
            官方入口 ↗
          </a>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">第二步：上传 SEACE 导出文件（Lista-Procesos .xls / .xlsx）</span>
          <input
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2.5 text-sm text-[#071826] outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#071826] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-[#0d2a40]"
          />
          {file && <span className="text-xs text-[#8a959c]">已选择：{file.name}</span>}
          <span className="text-xs text-[#8a959c]">
            文件本身就是时间范围，不再按天数过滤；库里已有的编号会跳过，不会覆盖。
          </span>
        </label>

        <label className="mt-5 flex items-center gap-2 border-t border-[#e5e9eb] pt-5 text-sm text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览，不会真的写入）
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-fit rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "处理中…" : write ? "写入 Supabase" : "预览"}
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
          <p className="text-sm text-[#52636e]">
            文件共 {result.totalRows} 条；{result.lateRestartCount > 0 ? `${result.lateRestartCount} 条是从评标阶段重启的（不是新机会），` : ""}
            {result.alreadyInDatabaseCount > 0 ? `${result.alreadyInDatabaseCount} 条库里已有，` : ""}
            {result.previouslyDeletedCount > 0 ? `${result.previouslyDeletedCount} 条之前被删除过，` : ""}
            新项目 {result.keptCount} 条：大型 {result.tierCounts.flagship}、中型 {result.tierCounts.significant}、普通 {result.tierCounts.standard}、不推荐 {result.tierCounts.excluded}。
          </p>
          {result.upsertedCount !== undefined && (
            <p className="text-sm font-semibold text-emerald-700">
              已写入 {result.upsertedCount} 条
              {result.skippedExcludedCount ? `，跳过 ${result.skippedExcludedCount} 条不推荐的（不写入）` : ""}
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败` : ""}
            </p>
          )}
          {result.failed && result.failed.length > 0 && (
            <ul className="text-xs text-red-700">
              {result.failed.slice(0, 10).map((f) => (
                <li key={f.slug}>
                  {f.slug}: {f.error}
                </li>
              ))}
            </ul>
          )}
          {result.surfaced.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[#e5e9eb]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f2f4f3] text-xs font-semibold text-[#52636e]">
                  <tr>
                    <th className="px-3 py-2">等级</th>
                    <th className="px-3 py-2">编号</th>
                    <th className="px-3 py-2">标题</th>
                    <th className="px-3 py-2">采购单位</th>
                    <th className="px-3 py-2">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {result.surfaced.map((t) => (
                    <tr key={t.slug} className="border-t border-[#e5e9eb]">
                      <td className="whitespace-nowrap px-3 py-2 text-[#233846]">{t.relevance.label.zh}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[#52636e]">{t.tenderNumber}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-[#233846]" title={t.title.es}>
                        {t.title.es}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-[#233846]" title={t.buyer}>
                        {t.buyer}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[#233846]">{money(t.estimatedValue, t.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-[#8a959c]">进入推荐的新项目共 {result.surfaced.length} 条，按等级和金额排序。</p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
