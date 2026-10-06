"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PANAMA_MANUAL_MAX_DAYS, type PanamaImportResponse, type PanamaImportRow } from "@/lib/ingestion/panama-import-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const DAY_OPTIONS = Array.from({ length: PANAMA_MANUAL_MAX_DAYS }, (_, index) => index + 1);

/** Panama City wall-clock time (UTC-5), which is what PanamaCompra shows. */
function panamaTime(iso: string | undefined): string {
  if (!iso) return "未写截止日";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function usd(value: number | undefined): string {
  return value === undefined ? "未写金额" : `US$${Math.round(value).toLocaleString("en-US")}`;
}

function RowLine({ row }: { row: PanamaImportRow }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-5">
      <span className="shrink-0 rounded-full bg-[#edf2f4] px-2 py-0.5 text-[11px] font-black text-[#233846]">{TIER_LABEL[row.tier] ?? row.tier}</span>
      <span className="min-w-0">
        <span title={row.title} className="line-clamp-2 text-[#071826]">{row.title}</span>
        <span className="block text-[#8a959c]">
          {row.number} · {row.buyer} · {usd(row.value)} · 交标截止 {panamaTime(row.deadline)}
        </span>
      </span>
    </li>
  );
}

/**
 * The 巴拿马 tab's manual run (user, 2026-10-06: 「巴拿马导入」页面，只拉最近
 * 1-5 天的项目，回溯仍交给每日任务). The daily job already runs it; this pulls
 * in the last few days early. Write is pre-checked, as on every other import
 * form (user, 2026-09-04: 写入 Supabase 全部预设勾选，要预览再取消勾选).
 */
export function ImportPanamaForm() {
  const router = useRouter();
  const [days, setDays] = useState(3);
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);
  const [result, setResult] = useState<PanamaImportResponse | null>(null);

  async function run() {
    if (write && !confirm(`确定要从 PanamaCompra 拉取最近 ${days} 天的巴拿马正式招标，并把保留的在招项目写入 Supabase 吗？`)) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-panama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, write }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ message: data.connectionFailed ? `连不上 PanamaCompra：${data.error}` : (data.error ?? `HTTP ${res.status}`), cliCommand: data.cliCommand });
        return;
      }
      setResult(data as PanamaImportResponse);
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
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        读取最近几天有状态变化的正式招标，再逐条读取在招项目的招标文件页（预算和截止日在那里），5 天约 1 分钟。已存在的项目只会更新，不会重复；已入库项目如果已开标、中标或取消，会同步状态。更早的项目由每日任务回溯。
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-[#233846]">
          最近
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          >
            {DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          天
        </label>
        <label className="flex items-center gap-2 text-sm text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览，不会真的写入）
        </label>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={submitting}
        className="mt-3 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "读取中…（逐条读取招标文件页，约 1 分钟）" : write ? "拉取并写入" : "预览"}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="break-words">{error.message}</p>
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
            最近 {result.days} 天有状态变化的正式招标 {result.listedCount} 条，仍在进行 {result.liveCount} 条，其中在招 {result.detailCount + result.unreadForTime} 条；保留{" "}
            <strong className="text-[#071826]">{result.kept.length}</strong> 条，排除 {result.excluded.length} 条。
          </p>
          {(result.detailErrors > 0 || result.unreadForTime > 0) && (
            <p className="mt-1 text-xs text-[#8a5a00]">
              {result.detailErrors > 0 ? `${result.detailErrors} 条招标文件页没读到` : ""}
              {result.detailErrors > 0 && result.unreadForTime > 0 ? "，" : ""}
              {result.unreadForTime > 0 ? `${result.unreadForTime} 条因超时没来得及读` : ""}，这次不写入，每日任务会再读。
            </p>
          )}
          {result.write ? (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.upsertedCount ?? 0} 条
              {result.statusUpdates ? `，同步状态 ${result.statusUpdates} 条` : ""}
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败：${result.failed.map((f) => f.slug).join("、")}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#7a878f]">预览——什么都没写入。</p>
          )}
          {result.kept.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.kept.map((row) => (
                <RowLine key={row.slug} row={row} />
              ))}
            </ul>
          )}
          {result.excluded.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[#64717c]">查看排除的 {result.excluded.length} 条</summary>
              <ul className="mt-1.5 flex flex-col gap-1.5 pl-1">
                {result.excluded.map((row) => (
                  <RowLine key={row.slug} row={row} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
