"use client";

import { useState } from "react";

// Mirrors AnalyzeUploadedDocumentResult (lib/ingestion/analyze-uploaded-
// document.ts) — redeclared here rather than imported, since that module
// transitively pulls in node:fs/node:child_process (document-intake.ts)
// and importing it from a "use client" component fails the Turbopack
// build the same way lib/ingestion/import-new-tenders.ts did earlier.
type AnalyzeResult = {
  fileName: string;
  documentType: string;
  tenderNumberInText?: string;
  model: string;
  qualifications: number;
  experienceRequirements: number;
  requiredDocuments: number;
  risks: number;
  status: "written" | "dry-run" | "skipped-opus-precision";
  message?: string;
};

export function AnalyzeDocumentForm({
  initialSlug,
  lockSlug = false,
  compact = false,
  onDone,
}: {
  /** Pre-fills the tender slug — used when this form is embedded next to a specific tender (e.g. a documents-needed row) instead of the standalone, any-slug page. */
  initialSlug?: string;
  /** Locks the slug field read-only — set alongside initialSlug when the caller already knows exactly which tender this upload is for. */
  lockSlug?: boolean;
  /** Tighter spacing/no card wrapper — for embedding inline in a table row. */
  compact?: boolean;
  /** Called after a successful write (not on dry-run/preview) — the caller can e.g. router.refresh() a list that should drop this tender now that it has a document. */
  onDone?: () => void;
}) {
  const [tenderSlug, setTenderSlug] = useState(initialSlug ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [write, setWrite] = useState(false);
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenderSlug.trim()) {
      setError("请先填写项目 slug。");
      return;
    }
    if (!file) {
      setError("请先选择一个文件。");
      return;
    }
    if (write && !confirm("确定要分析并写入 Supabase 吗？这会调用 LLM API 产生真实费用。")) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("tenderSlug", tenderSlug.trim());
    form.append("file", file);
    form.append("write", String(write));
    form.append("force", String(force));

    try {
      const res = await fetch("/api/admin/analyze-document", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as AnalyzeResult);
      if ((data as AnalyzeResult).status === "written") onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          {error === "unauthorized" && "（需要管理员权限）"}
        </p>
      )}

      <div className={compact ? "flex flex-col gap-4" : "rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6"}>
        {!lockSlug && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-[#52636e]">项目 slug</span>
            <input
              type="text"
              value={tenderSlug}
              onChange={(e) => setTenderSlug(e.target.value)}
              placeholder="例如 comprasmx-lo-09-jzo-009jzo001-t-36-2026"
              className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
            />
          </label>
        )}

        <label className={`${lockSlug ? "" : "mt-4"} flex flex-col gap-1.5 text-sm`}>
          <span className="text-xs font-semibold text-[#52636e]">标书文件（PDF / .docx / .doc）</span>
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2.5 text-sm text-[#071826] outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-[#071826] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-[#0d2a40]"
          />
          {file && <span className="text-xs text-[#8a959c]">已选择：{file.name}</span>}
        </label>

        <div className="mt-5 flex flex-col gap-2 border-t border-[#e5e9eb] pt-5">
          <label className="flex items-center gap-2 text-sm text-[#233846]">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
            写入 Supabase（不勾选则只预览，不会真的写入）
          </label>
          {write && (
            <label className="ml-6 flex items-center gap-2 text-sm text-[#7a878f]">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 accent-[#ffb21c]" />
              即使已有精度分析（claude-opus-5）结果，也强制覆盖
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-fit rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "分析中…" : write ? "分析并写入" : "预览"}
        </button>
      </div>

      {result && (
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 text-sm text-[#52636e] sm:p-6">
          <p>
            {result.fileName}（{result.documentType}），文中识别到的项目编号：{result.tenderNumberInText ?? "未找到"}，模型：{result.model}
          </p>
          <p className="mt-2">
            资质要求 {result.qualifications} / 业绩要求 {result.experienceRequirements} / 所需文件 {result.requiredDocuments} / 风险提示 {result.risks}
          </p>
          <p className="mt-2 font-semibold">
            {result.status === "written" && <span className="text-emerald-700">已写入 Supabase。</span>}
            {result.status === "dry-run" && <span className="text-[#52636e]">预览模式，未写入。</span>}
            {result.status === "skipped-opus-precision" && <span className="text-[#b86e00]">跳过 — {result.message}</span>}
          </p>
        </div>
      )}
    </form>
  );
}
