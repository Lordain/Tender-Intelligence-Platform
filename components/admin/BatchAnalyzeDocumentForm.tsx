"use client";

import { useState } from "react";
import type { LocalizedText } from "@/types/tender";
import { localize, useLocale } from "@/lib/i18n";

// Mirrors AnalyzeUploadedDocumentResult (lib/ingestion/analyze-uploaded-
// document.ts) — same reasoning as AnalyzeDocumentForm.tsx for not
// importing it directly from a "use client" component.
type AnalyzeResult = {
  oneLineSummary: string;
  qualifications: number;
  experienceRequirements: number;
  requiredDocuments: number;
  risks: number;
  status: "written" | "dry-run" | "skipped-opus-precision";
  message?: string;
};

type RowState =
  | { kind: "idle" }
  | { kind: "analyzing" }
  | { kind: "done"; result: AnalyzeResult }
  | { kind: "error"; message: string };

export const MAX_BATCH_SELECTION = 5;

export function BatchAnalyzeDocumentForm({
  tenders,
  onClear,
  onWritten,
}: {
  tenders: { slug: string; title: LocalizedText }[];
  /** Clears the whole selection (e.g. the "取消选择" button). */
  onClear: () => void;
  /** Called once per tender whose analysis was actually written, so the caller can drop it from the worklist. */
  onWritten: (slug: string) => void;
}) {
  const { locale } = useLocale();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const readyCount = tenders.filter((tender) => files[tender.slug]).length;

  function setFile(slug: string, file: File | null) {
    setFiles((current) => ({ ...current, [slug]: file }));
  }

  async function analyzeOne(slug: string, file: File) {
    setRows((current) => ({ ...current, [slug]: { kind: "analyzing" } }));
    const form = new FormData();
    form.append("tenderSlug", slug);
    form.append("file", file);
    form.append("write", String(write));
    try {
      const res = await fetch("/api/admin/analyze-document", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRows((current) => ({ ...current, [slug]: { kind: "done", result: data as AnalyzeResult } }));
      if ((data as AnalyzeResult).status === "written") onWritten(slug);
    } catch (err) {
      setRows((current) => ({ ...current, [slug]: { kind: "error", message: err instanceof Error ? err.message : String(err) } }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readyCount === 0) return;
    if (write && !confirm(`确定要分析并写入 Supabase 吗？这会对已选择文件的 ${readyCount} 个项目调用 LLM API，产生真实费用。`)) return;

    setSubmitting(true);
    // Sequential on purpose — a real extraction call can take up to a
    // couple of minutes (PDF chunking) and each one is a real LLM spend;
    // running them one at a time keeps this readable in the UI and avoids
    // firing several expensive calls at once by mistake.
    for (const tender of tenders) {
      const file = files[tender.slug];
      if (!file) continue;
      await analyzeOne(tender.slug, file);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e9eb] pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Batch upload</p>
          <h2 className="mt-1 text-lg font-black text-[#071826]">批量上传分析（已选 {tenders.length}/{MAX_BATCH_SELECTION}）</h2>
          <p className="mt-1 text-xs text-[#64717c]">为每个项目选择对应的标书文件后一起分析；未选择文件的项目会被跳过。</p>
        </div>
        <button type="button" onClick={onClear} className="h-9 shrink-0 rounded-lg border border-[#d8e0e3] bg-white px-3 text-xs font-black text-[#52636e] hover:border-[#9aa5ab]">
          取消选择
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {tenders.map((tender) => {
          const row = rows[tender.slug] ?? { kind: "idle" as const };
          return (
            <div key={tender.slug} className="flex flex-col gap-2 rounded-xl border border-[#e5e9eb] bg-white p-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[#071826]">{localize(tender.title, locale)}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[#8a959c]">{tender.slug}</p>
              </div>
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                disabled={submitting}
                onChange={(e) => setFile(tender.slug, e.target.files?.[0] ?? null)}
                className="w-full shrink-0 rounded-lg border border-[#d8e0e3] bg-white px-2 py-1.5 text-xs text-[#071826] outline-none file:mr-2 file:rounded-md file:border-0 file:bg-[#071826] file:px-2.5 file:py-1 file:text-[11px] file:font-bold file:text-white disabled:opacity-50 sm:w-64"
              />
              <div className="shrink-0 text-xs sm:w-48">
                {row.kind === "idle" && <span className="text-[#9aa5ab]">{files[tender.slug] ? "等待分析" : "未选择文件"}</span>}
                {row.kind === "analyzing" && <span className="font-bold text-[#b86e00]">分析中…</span>}
                {row.kind === "done" && row.result.status === "written" && (
                  <span className="font-bold text-emerald-700">已写入 — {row.result.oneLineSummary || "（无一句话总结）"}</span>
                )}
                {row.kind === "done" && row.result.status === "dry-run" && <span className="text-[#52636e]">预览完成，未写入</span>}
                {row.kind === "done" && row.result.status === "skipped-opus-precision" && (
                  <span className="text-[#b86e00]">跳过 — {row.result.message}</span>
                )}
                {row.kind === "error" && <span className="font-bold text-red-600">失败：{row.message}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9eb] pt-4">
        <label className="flex items-center gap-2 text-sm text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} disabled={submitting} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览，不会真的写入）
        </label>
        <button
          type="submit"
          disabled={submitting || readyCount === 0}
          className="h-10 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "分析中…" : write ? `分析并写入全部（${readyCount}）` : `预览全部（${readyCount}）`}
        </button>
      </div>
    </form>
  );
}
