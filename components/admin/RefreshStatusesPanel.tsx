"use client";

import { useState } from "react";
import { STATUS_LABELS } from "@/lib/tender-labels";
import type { TenderStatus } from "@/types/tender";

type Change = { slug: string; title: string; from: TenderStatus; to: TenderStatus };
type RefreshResult = {
  source: string;
  observedCount: number;
  matchedCount: number;
  changes: Change[];
  protectedSlugs: string[];
  reopenRefused: Change[];
  awaitingMigration: number;
  write: boolean;
  failed?: string;
  notes?: string[];
};

const SOURCES: { id: string; label: string; hint: string }[] = [
  { id: "mexico", label: "墨西哥 Compras MX", hint: "读 LicitIA 全量数据，约 1 分钟" },
  { id: "brazil", label: "巴西 PNCP", hint: "逐条查询，约 2–3 分钟" },
  { id: "chile", label: "智利 Mercado Público", hint: "逐条读项目页，约半分钟" },
  { id: "oxi", label: "秘鲁 OxI", hint: "读 ProInversión 全部状态清单" },
];

const label = (status: TenderStatus) => STATUS_LABELS[status]?.zh ?? status;

/**
 * 刷新标书状态 by hand — the same refreshers the daily job runs (user,
 * 2026-09-26: 自动&手动，刷新标书状态). Colombia's refresh lives on its own
 * tab, where it always has; Peru OECE's is the ingest:peru-live CLI, since
 * SEACE refuses this deployment's network.
 */
export function RefreshStatusesPanel() {
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function run(source: string, upload?: File) {
    if (write && !confirm("确定要按来源的最新状态更新已入库项目吗？人工改过状态的项目不会被改动。")) return;
    setRunning(upload ? "file" : source);
    setError(null);
    setResult(null);
    try {
      let res: Response;
      if (upload) {
        const form = new FormData();
        form.append("file", upload);
        form.append("write", String(write));
        res = await fetch("/api/admin/refresh-statuses", { method: "POST", body: form });
      } else {
        res = await fetch("/api/admin/refresh-statuses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, write }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as RefreshResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Status refresh</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">刷新标书状态</h2>
      <p className="mt-1 text-sm leading-6 text-[#52636e]">
        按来源的最新状态，更新已入库项目：暂停中、恢复招标、已中标、流标、已取消。只改状态，不动其他字段；人工改过状态的项目不会被改动；已结束的项目不会被自动改回招标中。每日任务会自动跑，这里只在想提前刷新时用。哥伦比亚在「哥伦比亚」标签页刷新。
      </p>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <label className="mt-4 flex items-center gap-2 border-t border-[#e5e9eb] pt-4 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览会变化的项目）
      </label>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => run(source.id)}
            disabled={running !== null}
            className="flex flex-col items-start rounded-xl border border-[#dbe2e5] bg-white px-4 py-3 text-left transition-colors hover:border-[#ffb21c] disabled:opacity-50"
          >
            <span className="text-sm font-black text-[#071826]">{running === source.id ? "运行中…" : `${write ? "刷新并写入" : "预览"}：${source.label}`}</span>
            <span className="mt-0.5 text-xs text-[#75838c]">{source.hint}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-[#e5e9eb] pt-4 text-sm text-[#233846] sm:flex-row sm:items-center">
        <span className="shrink-0 font-bold">秘鲁 OxI 手动文件：</span>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-w-0 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#edf2f4] file:px-3 file:py-1.5 file:text-xs file:font-bold"
        />
        <button
          type="button"
          onClick={() => file && run("oxi", file)}
          disabled={!file || running !== null}
          className="shrink-0 rounded-xl bg-[#ffb21c] px-4 py-2 text-xs font-black text-[#071826] hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running === "file" ? "运行中…" : "用文件刷新"}
        </button>
      </div>
      <p className="mt-1 text-xs text-[#8a97a0]">ProInversión 网站上「状态」选「全部」后点「Exportar a Excel」下载的文件。</p>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            来源 {result.observedCount} 条，其中已入库 {result.matchedCount} 条；状态变化 <strong>{result.changes.length}</strong> 条
            {result.write ? "（已写入）" : "（预览，未写入）"}。
          </p>
          {result.changes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-xs">
              {result.changes.slice(0, 50).map((change) => (
                <li key={change.slug}>
                  <span className="font-bold text-[#233846]">{label(change.from)} → {label(change.to)}</span>
                  <span className="ml-2 text-[#8a97a0]">{change.slug}</span>
                  <span className="ml-2">{change.title.slice(0, 60)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.protectedSlugs.length > 0 && <p className="mt-2 text-xs">人工改过状态、未动：{result.protectedSlugs.length} 条</p>}
          {result.reopenRefused.length > 0 && (
            <p className="mt-2 text-xs">
              来源称已重新开放、但本站已结束的 {result.reopenRefused.length} 条未自动改回（如确实恢复，请在项目管理里手动改）：
              {result.reopenRefused.slice(0, 5).map((c) => c.slug).join("，")}
            </p>
          )}
          {result.awaitingMigration > 0 && (
            <p className="mt-2 text-xs font-bold text-[#b86e00]">{result.awaitingMigration} 条应改为「暂停中」，需先在 Supabase 运行 0057_tender_lifecycle.sql。</p>
          )}
          {(result.notes ?? []).map((note) => <p key={note} className="mt-1 text-xs">{note}</p>)}
          {result.failed && <p className="mt-2 text-xs text-red-700">{result.failed}</p>}
        </div>
      )}
    </div>
  );
}
