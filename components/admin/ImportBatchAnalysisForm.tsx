"use client";

import { useState } from "react";
import type { ImportBatchAnalysisResult } from "@/lib/ingestion/import-batch-analysis";

const STATUS_LABELS: Record<ImportBatchAnalysisResult["status"], string> = {
  written: "已写入",
  "dry-run": "预览（未写入）",
  "tender-not-found": "跳过 — 找不到对应项目",
  "skipped-opus-precision": "跳过 — 已有精度分析结果",
};

const STATUS_CLASS: Record<ImportBatchAnalysisResult["status"], string> = {
  written: "bg-emerald-50 text-emerald-700",
  "dry-run": "bg-[#edf2f3] text-[#52636e]",
  "tender-not-found": "bg-red-50 text-red-700",
  "skipped-opus-precision": "bg-amber-50 text-[#b86e00]",
};

type ApiResponse = { fileCount: number; documentCount: number; results: ImportBatchAnalysisResult[] };

export function ImportBatchAnalysisForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [write, setWrite] = useState(false);
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("请先选择至少一个分析结果 JSON 文件。");
      return;
    }
    if (write && !confirm(force ? "确定要写入 Supabase，并覆盖已有的精度分析结果吗？" : "确定要写入 Supabase 吗？")) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setResponse(null);

    const form = new FormData();
    for (const file of files) form.append("files", file);
    form.append("write", String(write));
    form.append("force", String(force));

    try {
      const res = await fetch("/api/admin/import-analysis", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResponse(data as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">分析结果 JSON 文件（可多选）</span>
          <input
            type="file"
            accept="application/json,.json"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2.5 text-sm text-[#071826] outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#071826] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-[#0d2a40]"
          />
          {files.length > 0 && (
            <span className="text-xs text-[#8a959c]">已选择 {files.length} 个文件：{files.map((f) => f.name).join("、")}</span>
          )}
        </label>

        <div className="mt-5 flex flex-col gap-2 border-t border-[#e5e9eb] pt-5">
          <label className="flex items-center gap-2 text-sm text-[#233846]">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
            写入 Supabase（不勾选则只预览，不会真的写入）
          </label>
          {write && (
            <label className="ml-6 flex items-center gap-2 text-sm text-[#7a878f]">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 accent-[#ffb21c]" />
              即使该项目已有精度分析（claude-opus-5）结果，也强制覆盖
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-fit rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "处理中…" : write ? "写入 Supabase" : "预览"}
        </button>
      </div>

      {response && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#52636e]">
            {response.fileCount} 个文件，共 {response.documentCount} 份文档结果，归到 {response.results.length} 个项目。
          </p>
          <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f3] text-xs font-semibold text-[#52636e]">
                <tr>
                  <th className="px-4 py-3">项目 slug</th>
                  <th className="px-4 py-3">文档数</th>
                  <th className="px-4 py-3">资质</th>
                  <th className="px-4 py-3">业绩</th>
                  <th className="px-4 py-3">所需文件</th>
                  <th className="px-4 py-3">风险</th>
                  <th className="px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {response.results.map((r) => (
                  <tr key={r.slug} className="border-t border-[#e5e9eb]">
                    <td className="px-4 py-3 font-mono text-xs text-[#233846]">{r.slug}</td>
                    <td className="px-4 py-3 text-[#233846]">{r.documentCount}</td>
                    <td className="px-4 py-3 text-[#233846]">{r.qualifications}</td>
                    <td className="px-4 py-3 text-[#233846]">{r.experienceRequirements}</td>
                    <td className="px-4 py-3 text-[#233846]">{r.requiredDocuments}</td>
                    <td className="px-4 py-3 text-[#233846]">{r.risks}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                        {r.message ? `（${r.message}）` : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </form>
  );
}
