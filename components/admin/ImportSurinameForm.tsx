"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SurinameImportResponse, SurinameImportRow } from "@/lib/ingestion/suriname-import-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const METHOD_LABEL: Record<string, string> = { icb: "国际招标", ncb: "国内招标", eoi: "咨询意向征询" };

/** Paramaribo wall-clock time (UTC-3), which is what the notices state. */
function paramariboTime(iso: string | undefined): string {
  if (!iso) return "截止日未读出";
  return `截止 ${new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Paramaribo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}（帕拉马里博时间）`;
}

function howLabel(row: SurinameImportRow): string {
  return `${row.method ? METHOD_LABEL[row.method] : "公告未写明招标方式"}${row.financier ? ` · ${row.financier}` : ""}`;
}

/**
 * The 苏里南 tab's manual run, as Guyana's (ImportGuyanaForm). The daily job
 * already runs it; this is for pulling in a new notice early, or for
 * previewing what the rule keeps. Write is pre-checked, as on every other
 * import form (user, 2026-09-04: 写入 Supabase 全部预设勾选，要预览再取消勾选).
 */
export function ImportSurinameForm() {
  const router = useRouter();
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);
  const [result, setResult] = useState<SurinameImportResponse | null>(null);

  async function run() {
    if (write && !confirm("确定要从 gov.sr 拉取苏里南招标公告，并把保留的项目写入 Supabase 吗？（只在后台可见）")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-suriname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.connectionFailed ? `连不上 gov.sr：${data.error}` : (data.error ?? `HTTP ${res.status}`), cliCommand: data.cliCommand });
        return;
      }
      setResult(data as SurinameImportResponse);
      // The imported list below is rendered on the server; re-read it.
      if (write) router.refresh();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">手动导入</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">读取 gov.sr 招标栏目的全部公告，几秒钟。已存在的项目只会更新，不会重复。</p>

      <label className="mt-3 flex items-center gap-2 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览，不会真的写入）
      </label>

      <button
        type="button"
        onClick={run}
        disabled={submitting}
        className="mt-3 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "读取中…" : write ? "拉取并写入" : "预览"}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{error.message}</p>
          {error.cliCommand && (
            <p className="mt-1 text-xs">
              可以在自己电脑的项目目录里运行 <code>{error.cliCommand}</code>。
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 border-t border-[#eef1f2] pt-3 text-sm text-[#52636e]">
          {result.staleWarning && <p className="mb-2 rounded-lg bg-[#fff8e7] px-3 py-2 text-xs text-[#6d4c0d]">{result.staleWarning}</p>}
          <p>
            招标栏目 {result.postCount} 条；保留且仍在招标 <strong className="text-[#071826]">{result.kept.length}</strong> 条
            {result.noDeadline.length > 0 && `，读不出截止日 ${result.noDeadline.length} 条`}，其余 {result.others.length} 条。
          </p>
          {result.write ? (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.upsertedCount ?? 0} 条（只在后台可见）
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败：${result.failed.map((f) => f.slug).join("、")}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#7a878f]">预览——什么都没写入。</p>
          )}
          {result.kept.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.kept.map((row) => (
                <li key={row.slug} className="flex items-start gap-2 text-xs leading-5">
                  <span className="shrink-0 rounded-full bg-[#edf2f4] px-2 py-0.5 text-[11px] font-black text-[#233846]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <span className="min-w-0">
                    <span title={row.title} className="line-clamp-2 text-[#071826]">{row.title}</span>
                    <span className="block text-[#8a959c]">
                      {howLabel(row)} · {paramariboTime(row.deadline)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.noDeadline.length > 0 && (
            <div className="mt-2 rounded-lg bg-[#fff8e7] px-3 py-2 text-xs leading-5 text-[#6d4c0d]">
              <p className="font-semibold">规则保留、但公告正文没写截止日（多半写在附件 PDF 里），没有写入，请打开原文看：</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {result.noDeadline.map((row) => (
                  <li key={row.slug}>
                    <a href={row.url} target="_blank" rel="noreferrer" className="text-[#b86e00] hover:underline">
                      {row.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.others.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[#64717c]">查看其余 {result.others.length} 条（排除或已截止）</summary>
              <ul className="mt-1.5 flex flex-col gap-1 pl-1">
                {result.others.map((row) => (
                  <li key={row.slug} className="leading-5 text-[#7a878f]">
                    {row.title} <span className="text-[#a0aab0]">（{row.outcome === "closed" ? "已截止" : "排除"} · {howLabel(row)}）</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
