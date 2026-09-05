"use client";

import { useState } from "react";
import { NEW_TENDERS_SOURCES, type NewTendersSource, type ImportNewTendersResult } from "@/lib/ingestion/new-tenders-sources";

export function ImportTendersForm() {
  const [source, setSource] = useState<NewTendersSource>(NEW_TENDERS_SOURCES[0].value);
  const [file, setFile] = useState<File | null>(null);
  const [months, setMonths] = useState("6");
  // Defaults to checked per the user's explicit request (2026-09-04): "写入
  // Supabase 全部预设勾选，要预览再取消勾选" — uncheck to preview only.
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportNewTendersResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("请先选择一个导出文件。");
      return;
    }
    if (write && !confirm("确定要写入 Supabase 吗？")) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("source", source);
    form.append("file", file);
    form.append("write", String(write));
    form.append("months", months);

    try {
      const res = await fetch("/api/admin/import-tenders", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ImportNewTendersResult);
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-[#52636e]">数据来源</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as NewTendersSource)}
              className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
            >
              {NEW_TENDERS_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-[#52636e]">保留最近几个月发布的（0 = 不限制）</span>
            <input
              type="number"
              min={0}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">导出文件（.xlsx 或 .csv）</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2.5 text-sm text-[#071826] outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#071826] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-[#0d2a40]"
          />
          {file && <span className="text-xs text-[#8a959c]">已选择：{file.name}</span>}
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
            文件共 {result.totalRows} 行，成功映射 {result.mappedCount} 条，按最近 {result.months || "不限"} 个月过滤后剩 {result.keptAfterRecencyCount} 条。
          </p>
          {result.upsertedCount !== undefined && (
            <p className="text-sm font-semibold text-emerald-700">
              已写入 {result.upsertedCount} 条
              {result.skippedExcludedCount ? `，跳过 ${result.skippedExcludedCount} 条日常服务类（不写入）` : ""}
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
          {result.sample.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[#e5e9eb]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f2f4f3] text-xs font-semibold text-[#52636e]">
                  <tr>
                    <th className="px-3 py-2">标题</th>
                    <th className="px-3 py-2">采购单位</th>
                    <th className="px-3 py-2">相关度</th>
                    <th className="px-3 py-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sample.map((t) => (
                    <tr key={t.slug} className="border-t border-[#e5e9eb]">
                      <td className="max-w-xs truncate px-3 py-2 text-[#233846]">{t.title.es}</td>
                      <td className="px-3 py-2 text-[#233846]">{t.buyer}</td>
                      <td className="px-3 py-2 text-[#233846]">{t.relevance.tier}</td>
                      <td className="px-3 py-2 text-[#233846]">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-[#8a959c]">仅展示前 {result.sample.length} 条预览。</p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
