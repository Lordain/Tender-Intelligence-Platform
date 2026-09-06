"use client";

import { useState } from "react";
import type { LocalizedText } from "@/types/tender";
import { localize, useLocale } from "@/lib/i18n";

// Mirrors AnalyzeUploadedDocumentResult (lib/ingestion/analyze-uploaded-
// document.ts) — kept as a local type since that module transitively pulls
// in node:fs/node:child_process and can't be imported from a "use client"
// component.
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
  /** title is omitted when the caller only knows the slug (e.g. manually typed, not looked up from a known list) — the row then just shows the slug. */
  tenders: { slug: string; title?: LocalizedText }[];
  /** Clears the whole selection (e.g. the "取消选择" button). */
  onClear: () => void;
  /** Called once per tender whose analysis was actually written, so the caller can drop it from the worklist/selection. */
  onWritten: (slug: string) => void;
}) {
  const { locale } = useLocale();
  // Each tender can have more than one document (a Pliego plus one or more
  // Anexos are routinely separate files for the same tender) — analyzed
  // together as one merged result, not one call per file overwriting the
  // last (see analyze-uploaded-document.ts's header comment).
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const readyCount = tenders.filter((tender) => (files[tender.slug]?.length ?? 0) > 0).length;

  function setTenderFiles(slug: string, fileList: FileList | null) {
    setFiles((current) => ({ ...current, [slug]: fileList ? Array.from(fileList) : [] }));
  }

  function removeTenderFile(slug: string, index: number) {
    setFiles((current) => ({ ...current, [slug]: (current[slug] ?? []).filter((_, i) => i !== index) }));
  }

  async function analyzeOne(slug: string, tenderFiles: File[]) {
    setRows((current) => ({ ...current, [slug]: { kind: "analyzing" } }));
    const form = new FormData();
    form.append("tenderSlug", slug);
    tenderFiles.forEach((file) => form.append("file", file));
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
      const tenderFiles = files[tender.slug];
      if (!tenderFiles || tenderFiles.length === 0) continue;
      await analyzeOne(tender.slug, tenderFiles);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e9eb] pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Batch upload</p>
          <h2 className="mt-1 text-lg font-black text-[#071826]">批量上传分析（已选 {tenders.length}/{MAX_BATCH_SELECTION}）</h2>
          <p className="mt-1 text-xs text-[#64717c]">每个项目可以一次选择多个文件（比如正文 + 附件），会合并在一起分析。未选择文件的项目会被跳过。</p>
        </div>
        <button type="button" onClick={onClear} className="h-9 shrink-0 rounded-lg border border-[#d8e0e3] bg-white px-3 text-xs font-black text-[#52636e] hover:border-[#9aa5ab]">
          取消选择
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {tenders.map((tender, index) => {
          const row = rows[tender.slug] ?? { kind: "idle" as const };
          const tenderFiles = files[tender.slug] ?? [];
          return (
            <div key={tender.slug} className="flex flex-col gap-3 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="hidden size-6 shrink-0 items-center justify-center rounded-full bg-[#edf2f3] text-[11px] font-black text-[#52636e] sm:flex">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[#071826]">{tender.title ? localize(tender.title, locale) : tender.slug}</p>
                  {tender.title && <p className="mt-0.5 font-mono text-[11px] text-[#8a959c]">{tender.slug}</p>}
                </div>
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#071826] px-3 text-xs font-black text-white hover:bg-[#12364d]">
                  上传（可多选）
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    multiple
                    disabled={submitting}
                    onChange={(e) => setTenderFiles(tender.slug, e.target.files)}
                    className="hidden"
                  />
                </label>
                <div className="shrink-0 text-xs sm:w-48">
                  {row.kind === "idle" && <span className="text-[#9aa5ab]">{tenderFiles.length > 0 ? "等待分析" : "未选择文件"}</span>}
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
              {tenderFiles.length > 0 && (
                <ul className="flex flex-wrap gap-2 pl-0 sm:pl-10">
                  {tenderFiles.map((file, fileIndex) => (
                    <li key={`${file.name}-${fileIndex}`} className="inline-flex items-center gap-2 rounded-full border border-[#d8e0e3] bg-[#f7f8f7] py-1 pl-3 pr-1.5 text-[11px] text-[#425461]">
                      {file.name}
                      <button
                        type="button"
                        aria-label={`移除 ${file.name}`}
                        disabled={submitting}
                        onClick={() => removeTenderFile(tender.slug, fileIndex)}
                        className="flex size-4 items-center justify-center rounded-full text-[#8a959c] hover:bg-[#edf2f3] hover:text-red-600 disabled:opacity-50"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
