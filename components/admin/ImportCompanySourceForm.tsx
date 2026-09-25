"use client";

import { useState } from "react";
import type { CompanyImportResult } from "@/lib/admin/company-import";

/**
 * One manual button for a company source added on 2026-09-25 — Petronect,
 * Cemig, UPME, Petroperú — on its country's tab of 新项目清单 (user: 针对新接口，
 * 麻烦都在后台对应国家增加手动接口，都是只考虑1-3天的数据). Backed by
 * app/api/admin/import-company/route.ts, over the same code the daily job runs.
 */
type Source = CompanyImportResult["source"];

const DAY_CHOICES = [1, 2, 3] as const;

const TIER_LABELS: Record<string, string> = {
  flagship: "大型",
  significant: "中型",
  standard: "常规",
  excluded: "已过滤",
};

export function ImportCompanySourceForm({
  source,
  eyebrow,
  title,
  description,
  sourceUrl,
}: {
  source: Source;
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  sourceUrl: string;
}) {
  const [write, setWrite] = useState(false);
  const [days, setDays] = useState<number>(3);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CompanyImportResult | null>(null);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);

  async function run() {
    if (write && !confirm(`确定要把 ${title} 近 ${days} 天发布的项目写入 Supabase 吗？`)) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, write, days }),
      });
      const text = await res.text();
      let data: (CompanyImportResult & { error?: string; cliCommand?: string }) | null = null;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`服务器返回的不是 JSON（HTTP ${res.status}）。本地开发时，改了代码后重启 npm run dev 再试。`);
      }
      if (!res.ok || !data) {
        setError({ message: data?.error ?? `HTTP ${res.status}`, cliCommand: data?.cliCommand });
        return;
      }
      setResult(data);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">{title}</h2>
      <p className="mt-1 text-sm text-[#52636e]">{description}</p>
      <p className="mt-1 text-xs text-[#64717c]">
        已在每日自动任务里。手动只读<strong>近 1–3 天发布</strong>的；已删除的项目不会被重新导入。
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-[#b86e00] underline underline-offset-2">
          打开官网 ↗
        </a>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#233846]">
        <span>只导入发布</span>
        {DAY_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setDays(choice)}
            disabled={running}
            className={`h-7 rounded-lg border px-3 font-bold transition-colors disabled:opacity-50 ${
              days === choice ? "border-[#071826] bg-[#071826] text-white" : "border-[#d8e0e3] bg-white text-[#233846] hover:border-[#b86e00]"
            }`}
          >
            近 {choice} 天
          </button>
        ))}
        <span>的项目</span>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览）
      </label>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p>{error.message}</p>
          {error.cliCommand && (
            <p className="mt-2 border-t border-red-200 pt-2">
              线上部署可能连不上对方网站。可以在自己的电脑上跑：
              <code className="ml-1 break-all rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#071826]">{error.cliCommand}</code>
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {running ? "运行中…" : write ? "拉取并写入" : "预览"}
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4">
          {result.staleWarning && (
            <p className="mb-2 whitespace-pre-line rounded-lg border border-[#f0d9a8] bg-[#fff8e9] px-3 py-2 text-xs text-[#7a5200]">{result.staleWarning}</p>
          )}
          <p className="text-sm font-bold text-[#071826]">{result.summary}</p>
          {result.kept.length === 0 && !result.staleWarning && (
            <p className="mt-1 text-xs text-[#64717c]">近 {result.days} 天没有新的项目——这类来源本来就发得少，是正常的。</p>
          )}
          {result.write ? (
            <p className="mt-2 text-xs text-[#233846]">
              已写入 Supabase {result.upsertedCount ?? 0} 条
              {result.failed && result.failed.length > 0 ? `，失败 ${result.failed.length} 条` : ""}。
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#64717c]">预览模式，没有写入 Supabase。</p>
          )}
          {result.notWritten && result.notWritten.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-[#64717c]">
              {result.notWritten.map((line) => (
                <li key={line}>未导入：{line}</li>
              ))}
            </ul>
          )}
          {result.failed && result.failed.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-red-700">
              {result.failed.slice(0, 5).map((f, index) => (
                <li key={`${f.slug}-${index}`}>
                  {f.slug}: {f.error}
                </li>
              ))}
            </ul>
          )}
          {result.kept.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-[#eef1f2] pt-3 text-xs text-[#233846]">
              {result.kept.map((t) => (
                <li key={t.slug} className="truncate">
                  <span className="font-bold text-[#b86e00]">{TIER_LABELS[t.tier] ?? t.tier}</span> {t.tenderNumber}
                  {t.submissionDeadline ? ` · 截止 ${t.submissionDeadline.slice(0, 10)}` : ""} · {t.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
