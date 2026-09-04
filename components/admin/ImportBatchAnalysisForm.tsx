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
  written: "text-emerald-600 dark:text-emerald-400",
  "dry-run": "text-zinc-500",
  "tender-not-found": "text-red-600 dark:text-red-400",
  "skipped-opus-precision": "text-amber-600 dark:text-amber-400",
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
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-zinc-500">分析结果 JSON 文件（可多选）</span>
        <input
          type="file"
          accept="application/json,.json"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:file:bg-zinc-50 dark:file:text-zinc-900"
        />
        {files.length > 0 && (
          <span className="text-xs text-zinc-400">已选择 {files.length} 个文件：{files.map((f) => f.name).join("、")}</span>
        )}
      </label>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
          写入 Supabase（不勾选则只预览，不会真的写入）
        </label>
        {write && (
          <label className="ml-6 flex items-center gap-2 text-sm text-zinc-500">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            即使该项目已有精度分析（claude-opus-5）结果，也强制覆盖
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitting ? "处理中…" : write ? "写入 Supabase" : "预览"}
      </button>

      {response && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">
            {response.fileCount} 个文件，共 {response.documentCount} 份文档结果，归到 {response.results.length} 个项目。
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">项目 slug</th>
                  <th className="px-3 py-2 font-medium">文档数</th>
                  <th className="px-3 py-2 font-medium">资质</th>
                  <th className="px-3 py-2 font-medium">业绩</th>
                  <th className="px-3 py-2 font-medium">所需文件</th>
                  <th className="px-3 py-2 font-medium">风险</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {response.results.map((r) => (
                  <tr key={r.slug} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-mono text-xs">{r.slug}</td>
                    <td className="px-3 py-2">{r.documentCount}</td>
                    <td className="px-3 py-2">{r.qualifications}</td>
                    <td className="px-3 py-2">{r.experienceRequirements}</td>
                    <td className="px-3 py-2">{r.requiredDocuments}</td>
                    <td className="px-3 py-2">{r.risks}</td>
                    <td className={`px-3 py-2 ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                      {r.message ? `（${r.message}）` : ""}
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
