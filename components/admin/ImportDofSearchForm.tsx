"use client";

import { useState } from "react";
import { DEFAULT_DOF_ID_ORG, type ImportDofSearchLiveResult } from "@/lib/ingestion/dof-sources";

// DOF's own advanced-search page (sidof.segob.gob.mx/busquedaAvanzada/busqueda)
// takes fechaIni/fechaFin as free-form date strings passed straight through to
// its DataTables endpoint — the exact separator/order wasn't pinned down in the
// real capture this connector is built from, so this stays a plain text field:
// type it exactly as it appears on the DOF search page itself (same format the
// detail-page URLs use elsewhere in this project — DD/MM/YYYY) rather than a
// native date picker that could silently reformat it wrong.
export function ImportDofSearchForm() {
  const [texto, setTexto] = useState("");
  const [fechaIni, setFechaIni] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [idOrg, setIdOrg] = useState(DEFAULT_DOF_ID_ORG);
  const [months, setMonths] = useState("6");
  const [write, setWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportDofSearchLiveResult | null>(null);

  async function run() {
    if (!texto.trim()) {
      setError("请先填写采购单位关键词。");
      return;
    }
    if (!fechaIni.trim() || !fechaFin.trim()) {
      setError("请填写起止日期（格式需与 DOF 搜索页一致，例如 01/01/2026）。");
      return;
    }
    if (write && !confirm(`确定要从 DOF 官网直接拉取「${texto}」的搜索结果并写入 Supabase 吗？`)) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-dof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: texto.trim(),
          fechaIni: fechaIni.trim(),
          fechaFin: fechaFin.trim(),
          idOrg: idOrg.trim(),
          write,
          months: months.trim() === "" ? undefined : Number(months),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ImportDofSearchLiveResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Live fetch</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">DOF 直接拉取</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        DOF（联邦政府公报）高级搜索接口本身只需要一个普通会话 cookie，不用再打开浏览器 Console 手动抓取
        cURL——填写采购单位关键词和日期范围，服务器直接去 sidof.segob.gob.mx
        拉取，并逐条抓取每条通知自己的详情页（真实招标编号、标题和关键日期表）。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-[#52636e]">采购单位关键词</span>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="例如 Comisión Federal de Electricidad"
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">起始日期（DOF 搜索页格式）</span>
          <input
            type="text"
            value={fechaIni}
            onChange={(e) => setFechaIni(e.target.value)}
            placeholder="01/01/2026"
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">截止日期（DOF 搜索页格式）</span>
          <input
            type="text"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            placeholder="04/09/2026"
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-xs font-semibold text-[#52636e]">机构范围（idOrg，一般不用改）</span>
          <input
            type="text"
            value={idOrg}
            onChange={(e) => setIdOrg(e.target.value)}
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">保留最近几个月（0 = 不限制）</span>
          <input
            type="number"
            min={0}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
      </div>

      <label className="mt-4 flex items-center gap-2 border-t border-[#e5e9eb] pt-4 text-sm text-[#233846]">
        <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
        写入 Supabase（不勾选则只预览，不会真的写入）
      </label>

      <button
        type="button"
        onClick={run}
        disabled={submitting}
        className="mt-4 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {submitting ? "拉取中…（逐条抓取详情页，可能需要一些时间）" : write ? "拉取并写入" : "预览"}
      </button>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            搜索结果共 {result.totalNotas} 条，成功抓取详情页 {result.detailsFetched} 条，成功映射 {result.mappedCount} 条，按最近{" "}
            {result.months || "不限"} 个月过滤后剩 {result.keptAfterRecencyCount} 条。
          </p>
          {result.upsertedCount !== undefined && (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.upsertedCount} 条
              {result.skippedExcludedCount ? `，跳过 ${result.skippedExcludedCount} 条日常服务类` : ""}
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
