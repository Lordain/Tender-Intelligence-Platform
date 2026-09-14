"use client";

import { useEffect, useState } from "react";
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
  warnings?: string[];
};

type RowState =
  | { kind: "idle" }
  | { kind: "analyzing" }
  | { kind: "done"; result: AnalyzeResult }
  | { kind: "error"; message: string };

export const MAX_BATCH_SELECTION = 5;
/** Must stay <= MAX_FILES_PER_REQUEST in app/api/admin/analyze-document/route.ts — caught here so the admin finds out before uploading, not after. */
const MAX_FILES_PER_TENDER = 10;
/** Same as the route's own MAX_UPLOAD_BYTES, for the same reason. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function BatchAnalyzeDocumentForm({
  tenders,
  onClear,
  onWritten,
  onFinished,
}: {
  /** title is omitted when the caller only knows the slug (e.g. manually typed, not looked up from a known list) — the row then just shows the slug. */
  tenders: { slug: string; title?: LocalizedText }[];
  /** Clears the whole selection (e.g. the "取消选择" button). */
  onClear: () => void;
  /** Called once per tender whose analysis was actually written, so the caller can drop it from the worklist. Must NOT remove the row from `tenders` — see the note on onFinished. */
  onWritten: (slug: string) => void;
  /** Called once after the whole batch finishes. The caller does its single router.refresh() here rather than one per written tender — refreshing mid-batch re-renders the server tree (and re-runs its queries) up to five times for one action. */
  onFinished?: () => void;
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

  // A batch is minutes of real, paid model calls with no server-side
  // resume — closing the tab mid-run throws that spend away.
  useEffect(() => {
    if (!submitting) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [submitting]);

  /**
   * Appends rather than replaces (2026-09-06): picking the Pliego, then
   * opening the dialog again to add an Anexo, used to silently discard the
   * first pick — the exact "我选一个，另一个就被替换掉了" complaint this
   * whole flow was rebuilt for. Deduped on name+size+lastModified so
   * re-picking the same file in the second dialog doesn't queue it twice.
   */
  function addTenderFiles(slug: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const rejected: string[] = [];

    setFiles((current) => {
      const existing = current[slug] ?? [];
      const key = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;
      const seen = new Set(existing.map(key));
      const added: File[] = [];

      for (const file of incoming) {
        if (seen.has(key(file))) continue;
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`「${file.name}」超过 ${MAX_FILE_BYTES / 1024 / 1024}MB`);
          continue;
        }
        if (existing.length + added.length >= MAX_FILES_PER_TENDER) {
          rejected.push(`「${file.name}」超出单个项目最多 ${MAX_FILES_PER_TENDER} 个文件的上限`);
          continue;
        }
        seen.add(key(file));
        added.push(file);
      }

      return added.length > 0 ? { ...current, [slug]: [...existing, ...added] } : current;
    });

    if (rejected.length > 0) alert(`以下文件没有被添加：\n${rejected.join("\n")}`);
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
      // Not res.json() directly: a 500 from the dev server (or a proxy's
      // own 413) answers with HTML, and the SyntaxError that produces
      // would surface to the admin as "Unexpected token <" instead of
      // anything about what actually failed.
      const raw = await res.text();
      let data: (AnalyzeResult & { error?: string }) | null = null;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(res.ok ? "服务端返回了无法解析的响应" : `HTTP ${res.status}：${raw.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const result = data as AnalyzeResult;
      setRows((current) => ({ ...current, [slug]: { kind: "done", result } }));
      if (result.status === "written") onWritten(slug);
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
    onFinished?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e9eb] pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Batch upload</p>
          <h2 className="mt-1 text-lg font-black text-[#071826]">批量上传分析（已选 {tenders.length}/{MAX_BATCH_SELECTION}）</h2>
          <p className="mt-1 text-xs text-[#64717c]">每个项目可以一次选择多个文件（比如正文 + 附件），会合并在一起分析；再点一次可以继续追加。未选择文件的项目会被跳过。</p>
        </div>
        <button type="button" onClick={onClear} disabled={submitting} className="h-9 shrink-0 rounded-lg border border-[#d8e0e3] bg-white px-3 text-xs font-black text-[#52636e] hover:border-[#9aa5ab] disabled:opacity-50">
          取消选择
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {tenders.map((tender, index) => {
          const row = rows[tender.slug] ?? { kind: "idle" as const };
          const tenderFiles = files[tender.slug] ?? [];
          const warnings = row.kind === "done" ? row.result.warnings ?? [] : [];
          return (
            <div key={tender.slug} className="flex flex-col gap-3 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="hidden size-6 shrink-0 items-center justify-center rounded-full bg-[#edf2f3] text-[11px] font-black text-[#52636e] sm:flex">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-[#071826]">{tender.title ? localize(tender.title, locale) : tender.slug}</p>
                  {tender.title && <p className="mt-0.5 font-mono text-[11px] text-[#8a959c]">{tender.slug}</p>}
                </div>
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#071826] px-3 text-xs font-black text-white hover:bg-[#12364d]">
                  {tenderFiles.length > 0 ? "继续添加" : "上传（可多选）"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    multiple
                    disabled={submitting}
                    onChange={(e) => {
                      addTenderFiles(tender.slug, e.target.files);
                      // Reset so picking the SAME file again still fires
                      // onChange (a file input holds its value otherwise,
                      // and re-selecting it looks like nothing happened).
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
                <div className="shrink-0 text-xs sm:w-48">
                  {row.kind === "idle" && <span className="text-[#9aa5ab]">{tenderFiles.length > 0 ? `等待分析（${tenderFiles.length} 个文件）` : "未选择文件"}</span>}
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
                    <li key={`${file.name}-${file.size}-${file.lastModified}`} className="inline-flex items-center gap-2 rounded-full border border-[#d8e0e3] bg-[#f7f8f7] py-1 pl-3 pr-1.5 text-[11px] text-[#425461]">
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
              {row.kind === "done" && (
                <p className="pl-0 text-[11px] text-[#64717c] sm:pl-10">
                  资质 {row.result.qualifications} · 业绩 {row.result.experienceRequirements} · 文件 {row.result.requiredDocuments} · 风险 {row.result.risks}
                </p>
              )}
              {warnings.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-[#f2d9a8] bg-[#fff8ea] px-3 py-2 text-[11px] text-[#8a5a00] sm:ml-10">
                  {warnings.map((warning) => (
                    <li key={warning}>⚠ {warning}</li>
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
