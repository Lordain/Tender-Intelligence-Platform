"use client";

import { useState } from "react";

/**
 * The 秘鲁 tab of 新项目清单. Two panels, because Peru has two live sources
 * and they are different procurement systems, not two halves of one feed —
 * see lib/ingestion/ingest-peru.ts.
 *
 * Neither needs a file upload: both fetch live. That is the whole difference
 * from the Mexico tab, and it is why this form has no <input type="file">.
 */
type TierCounts = { flagship: number; significant: number; standard: number; excluded: number };

type PeruResult = {
  source: "oece" | "oxi";
  fetchedCount: number;
  mappedCount: number;
  keptAfterRecencyCount: number;
  surfacedCount: number;
  tierCounts: TierCounts;
  segments?: string[];
  write: boolean;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: { slug: string; tenderNumber: string; title: { es: string }; estimatedValue?: number; currency?: string; relevance: { tier: string } }[];
};

const TIER_LABELS: [keyof TierCounts, string][] = [
  ["flagship", "重点大项目"],
  ["significant", "重要项目"],
  ["standard", "常规项目"],
  ["excluded", "已过滤"],
];

function ResultPanel({ result }: { result: PeruResult }) {
  return (
    <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4">
      <p className="text-sm font-bold text-[#071826]">
        抓取 {result.fetchedCount} 条 → 映射 {result.mappedCount} 条 → 时间窗内 {result.keptAfterRecencyCount} 条 →{" "}
        <span className="text-[#b86e00]">进入推荐 {result.surfacedCount} 条</span>
        {result.segments && result.segments.length > 0 && (
          <span className="font-normal text-[#64717c]">（月份段：{result.segments.join("、")}）</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#52636e]">
        {TIER_LABELS.map(([tier, label]) => (
          <span key={tier}>
            {label} <strong className="text-[#071826]">{result.tierCounts[tier]}</strong>
          </span>
        ))}
      </div>
      {result.write ? (
        <p className="mt-2 text-xs text-[#233846]">
          已写入 Supabase {result.upsertedCount ?? 0} 条
          {result.skippedExcludedCount ? `，跳过已过滤 ${result.skippedExcludedCount} 条` : ""}
          {result.failed && result.failed.length > 0 ? `，失败 ${result.failed.length} 条` : ""}。
        </p>
      ) : (
        <p className="mt-2 text-xs text-[#64717c]">预览模式，没有写入 Supabase。</p>
      )}
      {result.failed && result.failed.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-700">
          {result.failed.slice(0, 5).map((f) => (
            <li key={f.slug}>
              {f.slug}: {f.error}
            </li>
          ))}
        </ul>
      )}
      {result.sample.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-[#eef1f2] pt-3 text-xs text-[#233846]">
          {result.sample.map((t) => (
            <li key={t.slug} className="truncate">
              <span className="font-mono text-[#64717c]">{t.relevance.tier}</span>{" "}
              {t.estimatedValue ? `${t.currency ?? ""} ${Math.round(t.estimatedValue).toLocaleString()}` : "无金额"} · {t.title.es}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ImportPeruForm() {
  const [months, setMonths] = useState("2");
  const [days, setDays] = useState("5");
  const [useDays, setUseDays] = useState(true);
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState<"oece" | "oxi" | null>(null);
  const [results, setResults] = useState<Partial<Record<"oece" | "oxi", PeruResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<"oece" | "oxi", string>>>({});

  async function run(source: "oece" | "oxi") {
    if (write && !confirm(`确定要把${source === "oece" ? " SEACE/OECE " : " Obras por Impuestos "}的秘鲁标书写入 Supabase 吗？`)) return;
    setRunning(source);
    setErrors((prev) => ({ ...prev, [source]: undefined }));
    try {
      const res = await fetch("/api/admin/import-peru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          write,
          months: Number(months) || 2,
          days: useDays ? Number(days) || 0 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults((prev) => ({ ...prev, [source]: data as PeruResult }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [source]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">共用设置</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-[#52636e]">抓取最近几个月的月份段（SEACE 用）</span>
            <input
              type="number"
              min={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="h-9 w-28 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-[#52636e]">只保留最近几天发布的</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useDays}
                onChange={(e) => setUseDays(e.target.checked)}
                className="size-4 accent-[#ffb21c]"
              />
              <input
                type="number"
                min={1}
                value={days}
                disabled={!useDays}
                onChange={(e) => setDays(e.target.value)}
                className="h-9 w-24 rounded-lg border border-[#d8e0e3] bg-white px-2 text-sm text-[#071826] outline-none focus:border-[#ffb21c] disabled:bg-[#f2f4f3]"
              />
            </div>
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs text-[#233846]">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
            写入 Supabase（不勾选则只预览）
          </label>
        </div>
        <p className="mt-2 text-xs text-[#64717c]">
          SEACE 的月份段只能整月抓取（官方接口的限制），所以「最近几天」是在抓回来之后再筛——省的是你要看的条数，不是请求数。
        </p>
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Perú · 主渠道</p>
        <h2 className="mt-1 text-lg font-black text-[#071826]">SEACE / OECE — 常规预算招标</h2>
        <p className="mt-1 text-sm text-[#52636e]">
          秘鲁绝大部分公共采购走这里，量最大（一个月约 4000 条），约一天延迟。数据里没有投标截止日，链接指向 SEACE 公共检索平台，配合项目编号检索。
        </p>
        {errors.oece && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.oece}</p>}
        <button
          type="button"
          onClick={() => run("oece")}
          disabled={running !== null}
          className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running === "oece" ? "运行中…" : write ? "拉取并写入" : "预览"}
        </button>
        {results.oece && <ResultPanel result={results.oece} />}
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Perú · 补充渠道</p>
        <h2 className="mt-1 text-lg font-black text-[#071826]">ProInversión — Obras por Impuestos（税收抵扣工程）</h2>
        <p className="mt-1 text-sm text-[#52636e]">
          量小但质量高（约 400 条在招，保留率约 40%），<strong>有真实投标截止日</strong>，每条都带官方单项目链接。
          投标方需为秘鲁纳税主体——每条项目会自动挂一条机制提示。
        </p>
        {errors.oxi && <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.oxi}</p>}
        <button
          type="button"
          onClick={() => run("oxi")}
          disabled={running !== null}
          className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {running === "oxi" ? "运行中…" : write ? "拉取并写入" : "预览"}
        </button>
        {results.oxi && <ResultPanel result={results.oxi} />}
      </div>
    </div>
  );
}
