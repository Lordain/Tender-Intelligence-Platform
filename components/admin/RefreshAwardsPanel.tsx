"use client";

import { useState } from "react";
import { ADMIN_EXTERNAL_LINK_CLASS, OXI_EXPORT_PAGE_URL } from "@/lib/admin-source-links";
import { AWARD_SOURCES, PERU_OECE_AWARDS_COMMAND, type AwardSourceId } from "@/lib/ingestion/award-source-labels";

type Fill = { slug: string; title: string; awardDate?: string; awardedTo?: string; awardedValue?: number; currency?: string };
type AwardResult = {
  source: string;
  candidates: number;
  observedCount: number;
  filled: Fill[];
  protectedSlugs: string[];
  currencyMismatch: string[];
  write: boolean;
  failed?: string;
  notes?: string[];
};

/**
 * 导入中标结果 by hand (user, 2026-09-26: 在后台，也增加一个手动导入中标结果
 * 的触发选项，可以在每个国家都有对应的选项). Each country tab renders it with
 * its own sources; 维护 renders every one. The daily job runs the same
 * refreshers after its status refresh — this is for not waiting until then.
 *
 * `manualNote` names the sources of that country that publish no award data
 * (PEMEX, CFE, the company portals), whose results are entered per tender in
 * 项目管理.
 */
export function RefreshAwardsPanel({ sources, manualNote }: { sources?: AwardSourceId[]; manualNote?: string }) {
  const shown = AWARD_SOURCES.filter((source) => !sources || sources.includes(source.id));
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwardResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function run(source: AwardSourceId, upload?: File) {
    if (write && !confirm("确定要把来源的中标结果写入已中标的项目吗？人工填过的中标信息不会被改动。")) return;
    setRunning(upload ? "file" : source);
    setError(null);
    setResult(null);
    try {
      let res: Response;
      if (upload) {
        const form = new FormData();
        form.append("file", upload);
        form.append("write", String(write));
        res = await fetch("/api/admin/refresh-awards", { method: "POST", body: form });
      } else {
        res = await fetch("/api/admin/refresh-awards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, write }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as AwardResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  const money = (fill: Fill) =>
    fill.awardedValue !== undefined ? `${fill.awardedValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}${fill.currency ? ` ${fill.currency}` : ""}` : null;

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Award results</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">导入中标结果</h2>
      <p className="mt-1 text-sm leading-6 text-[#52636e]">
        为<strong>已中标</strong>的项目补上中标日期、中标供应商、中标金额（区间取最大值）。只补空着的字段；实际中标日期会替换计划日期；人工填过的不改。每日任务在刷新状态后会自动跑，这里只在想提前补时用。
      </p>
      {error && <p className="mt-3 break-words rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <label className="mt-4 flex items-center gap-2 border-t border-[#e5e9eb] pt-4 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览会补上的项目）
      </label>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {shown.map((source) =>
          source.id === "oece" ? (
            <div key={source.id} className="flex flex-col items-start rounded-xl border border-dashed border-[#dbe2e5] bg-white px-4 py-3">
              <span className="text-sm font-black text-[#071826]">{source.label}（仅本机）</span>
              <span className="mt-0.5 text-xs text-[#75838c]">{source.hint}</span>
              <code className="mt-2 break-all rounded-lg bg-[#edf2f4] px-2 py-1 text-xs text-[#233846]">{PERU_OECE_AWARDS_COMMAND}</code>
            </div>
          ) : (
            <button
              key={source.id}
              type="button"
              onClick={() => run(source.id)}
              disabled={running !== null}
              className="flex flex-col items-start rounded-xl border border-[#dbe2e5] bg-white px-4 py-3 text-left transition-colors hover:border-[#ffb21c] disabled:opacity-50"
            >
              <span className="text-sm font-black text-[#071826]">{running === source.id ? "运行中…" : `${write ? "导入并写入" : "预览"}：${source.label}`}</span>
              <span className="mt-0.5 text-xs text-[#75838c]">{source.hint}</span>
            </button>
          ),
        )}
      </div>
      {shown.some((source) => source.id === "oxi") && (
        <>
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
              {running === "file" ? "运行中…" : "用文件导入"}
            </button>
          </div>
          <p className="mt-1 text-xs text-[#8a97a0]">
            <a href={OXI_EXPORT_PAGE_URL} target="_blank" rel="noopener noreferrer" className={ADMIN_EXTERNAL_LINK_CLASS}>打开 ProInversión OxI 页面 ↗</a>
            ，「状态」选「全部」后点「Exportar a Excel」，把下载的文件（含 Monto Adjudicado、Fecha Buena Pro 两列）选到这里。
          </p>
        </>
      )}
      {manualNote && <p className="mt-3 text-xs leading-5 text-[#64717c]">{manualNote}</p>}

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            已中标但缺中标信息的项目 {result.candidates} 条，来源有记录 {result.observedCount} 条；补上 <strong>{result.filled.length}</strong> 条
            {result.write ? "（已写入）" : "（预览，未写入）"}。
          </p>
          {result.filled.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-xs">
              {result.filled.slice(0, 50).map((fill) => (
                <li key={fill.slug} className="break-words">
                  <span className="font-bold text-[#233846]">{fill.title.slice(0, 50)}</span>
                  <span className="ml-2">{[fill.awardDate, fill.awardedTo, money(fill)].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
          {result.protectedSlugs.length > 0 && <p className="mt-2 text-xs">人工填过中标信息、未动：{result.protectedSlugs.length} 条</p>}
          {result.currencyMismatch.length > 0 && <p className="mt-2 text-xs">金额币种与项目不一致、未写金额：{result.currencyMismatch.slice(0, 5).join("，")}</p>}
          {(result.notes ?? []).map((note) => <p key={note} className="mt-1 text-xs">{note}</p>)}
          {result.failed && <p className="mt-2 text-xs text-red-700">{result.failed}</p>}
        </div>
      )}
    </div>
  );
}
