"use client";

import { useState } from "react";

type DiscoverResult = {
  vigenteCount: number;
  newCount: number;
  mappedCount: number;
  resolvedLinksCount: number;
  keptAfterRecencyCount: number;
  months: number;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  protectedCount?: number;
  skippedManuallyDeletedCount?: number;
  failed?: { slug: string; error: string }[];
};

type ResolveLinksResult = {
  candidateCount: number;
  resolvedCount: number;
  notFoundCount: number;
  errorCount: number;
  write: boolean;
};

type FixBuyerNamesResult = {
  candidateCount: number;
  fixedCount: number;
  unchangedCount: number;
  write: boolean;
};

/**
 * Web-form counterpart to the three CLI-only LicitIA maintenance scripts
 * (npm run discover:comprasmx-vigente / resolve:comprasmx-links /
 * fix:licitia-buyer-names) — see lib/ingestion/discover-comprasmx-vigente.ts,
 * resolve-comprasmx-links.ts, fix-licitia-buyer-names.ts for the shared
 * logic each button calls into. None of this refreshes automatically —
 * these are still manual, on-demand operations, just no longer requiring
 * a terminal.
 */
export function LicitiaRefreshPanel() {
  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Maintenance</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">LicitIA 刷新</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        三个原本只能在命令行跑的维护操作，现在都可以在这里手动触发。都不是自动定时的——需要的时候点一下就行。
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <DiscoverSection />
        <div className="border-t border-[#e5e9eb] pt-4">
          <ResolveLinksSection />
        </div>
        <div className="border-t border-[#e5e9eb] pt-4">
          <FixBuyerNamesSection />
        </div>
      </div>
    </div>
  );
}

function DiscoverSection() {
  const [months, setMonths] = useState("6");
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoverResult | null>(null);

  async function run() {
    if (write && !confirm("确定要从 LicitIA 拉取新的 vigente 标书并写入 Supabase 吗？这个操作可能需要几分钟。")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/licitia/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write, months: months.trim() === "" ? undefined : Number(months) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as DiscoverResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-black text-[#071826]">发现新标书</h3>
      <p className="mt-1 text-xs text-[#52636e]">
        从 LicitIA 的批量数据下载所有当前&quot;vigente&quot;（招标中）的标书，跳过已入库的（不限来源），映射后写入。可能需要几分钟。
      </p>
      {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-[#52636e]">保留最近几个月（0 = 不限制）</span>
          <input
            type="number"
            min={0}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="h-9 w-32 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "运行中…" : write ? "拉取并写入" : "预览"}
        </button>
      </div>
      {result && (
        <div className="mt-2 text-xs text-[#52636e]">
          <p>
            共 {result.vigenteCount} 条&quot;vigente&quot;，{result.newCount} 条是新的，成功映射 {result.mappedCount} 条（{result.resolvedLinksCount} 条有真实链接），按最近{" "}
            {result.months || "不限"} 个月过滤后剩 {result.keptAfterRecencyCount} 条。
          </p>
          {result.upsertedCount !== undefined && (
            <p className="mt-1 font-semibold text-emerald-700">
              已写入 {result.upsertedCount} 条
              {result.skippedExcludedCount ? `，跳过 ${result.skippedExcludedCount} 条日常服务类` : ""}
              {result.protectedCount ? `，${result.protectedCount} 条保留人工锁定的分类` : ""}
              {result.skippedManuallyDeletedCount ? `，跳过 ${result.skippedManuallyDeletedCount} 条人工删除过的` : ""}
              {result.failed && result.failed.length > 0 ? `，${result.failed.length} 条失败` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResolveLinksSection() {
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveLinksResult | null>(null);

  async function run() {
    if (write && !confirm("确定要给还没有真实链接的标书补全 Compras MX 详情页链接吗？")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/licitia/resolve-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ResolveLinksResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-black text-[#071826]">补全真实链接</h3>
      <p className="mt-1 text-xs text-[#52636e]">
        给还停留在 Compras MX 通用搜索页链接的标书，通过 LicitIA 补上真实的详情页链接。
      </p>
      {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "运行中…" : write ? "补全并写入" : "预览"}
        </button>
      </div>
      {result && (
        <p className="mt-2 text-xs text-[#52636e]">
          {result.candidateCount === 0 ? (
            "没有需要补全链接的标书。"
          ) : (
            <>
              共 {result.candidateCount} 条待补全，成功解析 {result.resolvedCount} 条（{result.notFoundCount} 条 LicitIA 还没收录，{result.errorCount} 条出错）
              {result.write ? "，已写入。" : "（预览，未写入）。"}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function FixBuyerNamesSection() {
  const [write, setWrite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FixBuyerNamesResult | null>(null);

  async function run() {
    if (write && !confirm("确定要重新检查并修复 LicitIA 来源标书的采购单位名称吗？")) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/licitia/fix-buyer-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as FixBuyerNamesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-black text-[#071826]">修复采购单位名称</h3>
      <p className="mt-1 text-xs text-[#52636e]">
        逐条重新核对所有标书的采购单位名称（不限来源——包括 Compras MX 开放招标导入的），通过 LicitIA 详情接口尝试补全真实全名，把&quot;073R96&quot;&quot;081013&quot;这类原始代码换成真实全名。
      </p>
      {error && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览）
        </label>
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "运行中…" : write ? "修复并写入" : "预览"}
        </button>
      </div>
      {result && (
        <p className="mt-2 text-xs text-[#52636e]">
          共 {result.candidateCount} 条，可修复 {result.fixedCount} 条（{result.unchangedCount} 条已经是最好的名称）
          {result.write ? "，已写入。" : "（预览，未写入）。"}
        </p>
      )}
    </div>
  );
}
