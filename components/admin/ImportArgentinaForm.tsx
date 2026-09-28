"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArgentinaImportResponse, ArgentinaImportRow, ArgentinaSourceId } from "@/lib/ingestion/argentina-import-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

const SOURCES: { id: ArgentinaSourceId; label: string; hint: string }[] = [
  { id: "contratar", label: "CONTRAT.AR", hint: "全国工程、特许经营、私有化 · 约半分钟" },
  { id: "adif", label: "ADIF", hint: "国家铁路基础设施公司 · 约半分钟" },
  { id: "boletin", label: "政府公报", hint: "国企和省级项目，最近两期 · 约 1 分钟" },
  { id: "comprar", label: "COMPR.AR", hint: "全国货物与服务，逐页读 400 多条 · 可能超过网页 5 分钟上限，超时请用命令行" },
];

const SOURCE_SHORT: Record<ArgentinaSourceId, string> = { comprar: "COMPR.AR", contratar: "CONTRAT.AR", adif: "ADIF", boletin: "政府公报" };

function deadline(row: ArgentinaImportRow): string {
  return row.submissionDeadline ? `截标 ${new Date(row.submissionDeadline).toLocaleDateString("zh-CN", { timeZone: "America/Argentina/Buenos_Aires" })}` : "截标日期未读到";
}

/**
 * The 阿根廷 tab's manual run. The daily job already runs all four sources;
 * this is for pulling in today's calls early, or previewing what the rules
 * keep. Write is pre-checked, as on every other import form (user,
 * 2026-09-04: 写入 Supabase 全部预设勾选，要预览再取消勾选). COMPR.AR is left
 * unchecked: its page-by-page walk can outlast the web host's five minutes.
 */
export function ImportArgentinaForm() {
  const router = useRouter();
  const [write, setWrite] = useState(true);
  const [sources, setSources] = useState<ArgentinaSourceId[]>(["contratar", "adif", "boletin"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; cliCommand?: string } | null>(null);
  const [result, setResult] = useState<ArgentinaImportResponse | null>(null);

  function toggle(id: ArgentinaSourceId) {
    setSources((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function run() {
    if (sources.length === 0) return;
    if (write && !confirm("确定要读取所选的阿根廷来源，并把保留的项目写入 Supabase 吗？（只在后台可见）")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-argentina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write, sources }),
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}（多半是超过了 5 分钟上限）` }));
      if (!res.ok) {
        setError({ message: data.connectionFailed ? `连不上来源网站：${data.error}` : (data.error ?? `HTTP ${res.status}`), cliCommand: data.cliCommand });
        return;
      }
      setResult(data as ArgentinaImportResponse);
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
      <p className="mt-1 text-xs leading-5 text-[#64717c]">读取所选来源当前全部在招项目。已存在的项目只会更新，不会重复。</p>

      <fieldset className="mt-3 flex flex-col gap-2">
        {SOURCES.map((source) => (
          <label key={source.id} className="flex items-start gap-2 text-sm text-[#233846]">
            <input type="checkbox" checked={sources.includes(source.id)} onChange={() => toggle(source.id)} className="mt-1 size-4 shrink-0 accent-[#ffb21c]" />
            <span className="min-w-0">
              <span className="font-bold">{source.label}</span>
              <span className="block text-xs text-[#7a878f]">{source.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="mt-3 flex items-center gap-2 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览，不会真的写入）
      </label>

      <button
        type="button"
        onClick={run}
        disabled={submitting || sources.length === 0}
        className="mt-3 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "读取中…" : write ? "拉取并写入" : "预览"}
      </button>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="break-words">{error.message}</p>
          {error.cliCommand && (
            <p className="mt-1 text-xs">
              可以在自己电脑的项目目录里运行 <code className="break-all">{error.cliCommand}</code>。
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 border-t border-[#eef1f2] pt-3 text-sm text-[#52636e]">
          <ul className="flex flex-col gap-1 text-xs leading-5">
            {result.sources.map((source) => (
              <li key={source.id}>
                <span className="font-bold text-[#233846]">{source.label}</span>
                {source.error ? (
                  <span className="text-red-700"> —— 读取失败：{source.error}</span>
                ) : (
                  <span>
                    {" "}
                    —— 列出 {source.listed} 条，读取 {source.mapped} 条，保留 <strong className="text-[#071826]">{source.kept}</strong> 条
                    {source.failures > 0 ? `，${source.failures} 条读取失败` : ""}（{source.seconds} 秒）
                  </span>
                )}
              </li>
            ))}
          </ul>
          {result.write ? (
            <p className="mt-2 font-semibold text-emerald-700">
              已写入 {result.upsertedCount ?? 0} 条（只在后台可见）
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败：${result.failed.map((f) => f.slug).join("、")}` : ""}
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#7a878f]">预览——什么都没写入。</p>
          )}
          {result.kept.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.kept.map((row) => (
                <li key={row.slug} className="flex items-start gap-2 text-xs leading-5">
                  <span className="shrink-0 rounded-full bg-[#edf2f4] px-2 py-0.5 text-[11px] font-black text-[#233846]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <span className="min-w-0">
                    <span title={row.title} className="line-clamp-2 text-[#071826]">{row.title}</span>
                    <span className="block text-[#8a959c]">
                      {SOURCE_SHORT[row.source]} · {row.tenderNumber} · {deadline(row)}
                      {row.estimatedUsd ? ` · 约 ${(row.estimatedUsd / 1_000_000).toFixed(1)} 百万美元` : ""}
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
                    {row.title} <span className="text-[#a0aab0]">（{SOURCE_SHORT[row.source]}；{row.reason.split("，")[0]}）</span>
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
