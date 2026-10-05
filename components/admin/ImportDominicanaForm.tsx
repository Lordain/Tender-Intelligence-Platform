"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOMINICANA_IMPORT_DAYS, type DominicanaImportResponse, type DominicanaImportRow } from "@/lib/ingestion/dominicana-import-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function amountLabel(row: DominicanaImportRow): string {
  return row.amount === null ? "未公布金额" : `${row.currency ?? ""} ${Math.round(row.amount).toLocaleString("en-US")}`.trim();
}

function whyNotKept(row: DominicanaImportRow): string {
  return row.open ? "规则排除" : "已过投标截止";
}

/**
 * The 多米尼加 tab's manual run (user, 2026-10-04: 也做一下手动接口). The
 * daily job reads the last three days; this pulls in today's notices early,
 * previews what the rules keep, or backfills a wider window. Write is
 * pre-checked, as on every other import form (user, 2026-09-04: 写入 Supabase
 * 全部预设勾选，要预览再取消勾选).
 */
export function ImportDominicanaForm() {
  const router = useRouter();
  const [write, setWrite] = useState(true);
  const [days, setDays] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);
  const [result, setResult] = useState<DominicanaImportResponse | null>(null);

  async function run() {
    if (write && !confirm(`确定要读取多米尼加 DGCP 最近 ${days} 天发布的项目，并把保留的写入 Supabase 吗？`)) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-dominicana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write, days }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.connectionFailed ? `连不上 DGCP 开放数据接口：${data.error}` : (data.error ?? `HTTP ${res.status}`), cliCommand: data.cliCommand });
        return;
      }
      setResult(data as DominicanaImportResponse);
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
      <p className="mt-1 text-xs leading-5 text-[#64717c]">读取所选时间内发布的全部采购程序，只看公开招标和全国紧急状态例外程序；30 天约需 1 分钟。已存在的项目只会更新，不会重复。</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#233846]">
        <span>发布时间：最近</span>
        {DOMINICANA_IMPORT_DAYS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            aria-pressed={days === option}
            className={`rounded-lg border px-3 py-1.5 text-xs font-black transition-colors ${
              days === option ? "border-[#061b2b] bg-[#061b2b] text-white" : "border-[#dbe2e5] bg-white text-[#52636e] hover:border-[#b9c4c9]"
            }`}
          >
            {option} 天
          </button>
        ))}
      </div>

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
          <p>
            最近 {result.days} 天发布 {result.listedCount} 条，其中公开招标及紧急程序 {result.publicTenderCount} 条；保留 <strong className="text-[#071826]">{result.kept.length}</strong> 条。
          </p>
          {result.write ? (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.upsertedCount ?? 0} 条，标书链接 {result.documentLinks ?? 0} 个
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
                      {row.code} · {row.buyer} · {amountLabel(row)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.notKept.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[#64717c]">查看未保留的 {result.notKept.length} 条</summary>
              <ul className="mt-1.5 flex flex-col gap-1 pl-1">
                {result.notKept.map((row) => (
                  <li key={row.slug} className="leading-5 text-[#7a878f]">
                    {row.title}{" "}
                    <span className="text-[#a0aab0]">
                      （{whyNotKept(row)} · {amountLabel(row)}）
                    </span>
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
