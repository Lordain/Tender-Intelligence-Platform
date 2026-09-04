"use client";

import { useState } from "react";
import { PEMEX_LIST_TITLES, type PemexListTitle, type ImportPemexLiveResult } from "@/lib/ingestion/pemex-sources";

// Real full names for every subsidiary list — the first three were
// confirmed earlier this session (see pemex-mapper.ts's own header comment
// / lib/ingestion/README.md); PE/PF/PPS added per the user's own real-world
// research (2026-09-04, matching PEMEX's actual current subsidiary
// structure: Etileno/Fertilizantes/Perforación y Servicios).
// "Concursos-e-invitaciones" isn't tied to one subsidiary at all (it's a
// separate, broader list) — "Pemex Concursos e Invitaciones" is the user's
// own placeholder label for it, not a real corporate entity name, same as
// every other value here being the buyer name submitted with each tender.
const KNOWN_BUYER_NAMES: Partial<Record<PemexListTitle, string>> = {
  "Concursos-Abiertos-PEP": "Pemex Exploración y Producción",
  "Concursos-Abiertos-PTI": "Pemex Transformación Industrial",
  "Concursos-Abiertos-PL": "Pemex Logística",
  "Concursos-Abiertos-PE": "Pemex Etileno",
  "Concursos-Abiertos-PF": "Pemex Fertilizantes",
  "Concursos-Abiertos-PPS": "Pemex Perforación y Servicios",
  "Concursos-e-invitaciones": "Pemex Concursos e Invitaciones",
};

export function ImportPemexForm() {
  const [listTitle, setListTitle] = useState<PemexListTitle>(PEMEX_LIST_TITLES[0]);
  const [buyer, setBuyer] = useState(KNOWN_BUYER_NAMES[PEMEX_LIST_TITLES[0]] ?? "");
  const [months, setMonths] = useState("6");
  // Defaults to checked per the user's explicit request (2026-09-04): "写入
  // Supabase 全部预设勾选，要预览再取消勾选" — uncheck to preview only.
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportPemexLiveResult | null>(null);

  function handleListTitleChange(value: PemexListTitle) {
    setListTitle(value);
    // Real bug (2026-09-04, user-caught): switching to a list with no known
    // buyer name (PPS, PF, PE, "Concursos-e-invitaciones") left whatever
    // name a PREVIOUS selection had set (e.g. "Pemex Logística" from PL)
    // sitting in the field — since the old code only ever set the field
    // when a known name existed, never cleared it otherwise. That risks
    // silently submitting the wrong buyer's name for a genuinely different
    // subsidiary. Always resolving from KNOWN_BUYER_NAMES (falling back to
    // "") clears it for every list without a confirmed real name, forcing
    // the admin to fill in the real one by hand rather than being misled.
    setBuyer(KNOWN_BUYER_NAMES[value] ?? "");
  }

  async function run() {
    if (!buyer.trim()) {
      setError("请先填写采购单位名称。");
      return;
    }
    if (write && !confirm(`确定要从 PEMEX 官网直接拉取「${listTitle}」并写入 Supabase 吗？`)) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-pemex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listTitle, buyer: buyer.trim(), write, months: months.trim() === "" ? undefined : Number(months) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ImportPemexLiveResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Live fetch</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">PEMEX 直接拉取</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        PEMEX 的 SharePoint 招标列表接口本身是匿名公开的，不用再打开浏览器 Console 手动抓取——选一个子公司列表，服务器直接去
        pemex.com 拉取最新数据。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">子公司列表</span>
          <select
            value={listTitle}
            onChange={(e) => handleListTitleChange(e.target.value as PemexListTitle)}
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          >
            {PEMEX_LIST_TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold text-[#52636e]">采购单位（真实全名）</span>
          <input
            type="text"
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="例如 Pemex Exploración y Producción"
            className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
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
        {submitting ? "拉取中…" : write ? "拉取并写入" : "预览"}
      </button>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            「{result.listTitle}」共 {result.totalItems} 条，成功映射 {result.mappedCount} 条，按最近 {result.months || "不限"} 个月过滤后剩{" "}
            {result.keptAfterRecencyCount} 条。
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
