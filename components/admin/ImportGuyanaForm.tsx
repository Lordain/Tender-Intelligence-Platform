"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuyanaImportResponse, GuyanaImportRow } from "@/lib/ingestion/guyana-import-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function howLabel(row: GuyanaImportRow): string {
  const how = row.competition === "international" ? "国际招标" : row.competition === "national" ? "国内招标" : "公告未写明招标方式或读不出";
  return `${how}${row.fromSibling ? "（按同项目其他标段）" : ""}${row.financier ? ` · ${row.financier}` : ""}`;
}

/**
 * The 圭亚那 tab's manual run (user, 2026-09-27: 增加手动导入按钮). The daily
 * job already runs it; this is for pulling in today's notices early, or for
 * previewing what the rule keeps. Write is pre-checked, as on every other
 * import form (user, 2026-09-04: 写入 Supabase 全部预设勾选，要预览再取消勾选).
 */
export function ImportGuyanaForm() {
  const router = useRouter();
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);
  const [result, setResult] = useState<GuyanaImportResponse | null>(null);

  async function run() {
    if (write && !confirm("确定要从 eprocure.gov.gy 拉取圭亚那在招项目，并把保留的大型项目写入 Supabase 吗？（只在后台可见）")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-guyana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.connectionFailed ? `连不上 eprocure.gov.gy：${data.error}` : (data.error ?? `HTTP ${res.status}`), cliCommand: data.cliCommand });
        return;
      }
      setResult(data as GuyanaImportResponse);
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
      <p className="mt-1 text-xs leading-5 text-[#64717c]">读取 eprocure.gov.gy 当前全部在招项目和招标公告，约半分钟。已存在的项目只会更新，不会重复。</p>

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
            在招 {result.listedCount} 条，读到公告文字 {result.readNoticeCount} 条；保留 <strong className="text-[#071826]">{result.kept.length}</strong> 条，排除 {result.excluded.length} 条。
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
                    {/* Lot lists run to five lines; the full name is on hover and on the row's edit page. */}
                    <span title={row.title} className="line-clamp-2 text-[#071826]">{row.title}</span>
                    <span className="block text-[#8a959c]">
                      {row.projectId} · {howLabel(row)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.excluded.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[#64717c]">查看排除的 {result.excluded.length} 条</summary>
              <ul className="mt-1.5 flex flex-col gap-1 pl-1">
                {result.excluded.map((row) => (
                  <li key={row.slug} className="leading-5 text-[#7a878f]">
                    {row.title} <span className="text-[#a0aab0]">（{howLabel(row)}）</span>
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
