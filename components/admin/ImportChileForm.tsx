"use client";

import { useState } from "react";

/**
 * The 智利 tab of 新项目清单 (user, 2026-09-25: 智利后台没有手动加项目的选项？
 * 请加一下). Two panels, one per source, both over the exact code the daily
 * job runs — app/api/admin/import-chile/route.ts.
 *
 * Both sources already run every day on their own, so this page is for
 * forcing an early run or previewing what the schedule would write, not the
 * normal way Chilean tenders arrive.
 */
type Source = "mercadopublico" | "codelco";
type TierCounts = { flagship: number; significant: number; standard: number; excluded: number };
type SampleTender = {
  slug: string;
  tenderNumber: string;
  title: { es: string };
  estimatedValue?: number;
  currency?: string;
  submissionDeadline?: string;
  relevance: { tier: string };
};

type MercadoPublicoResult = {
  source: "mercadopublico";
  fetchedCount: number;
  keptAfterRecencyCount: number;
  surfacedCount: number;
  tierCounts: TierCounts;
  enrichedCount: number;
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  skippedExcludedCount?: number;
  failed?: { slug: string; error: string }[];
  sample: SampleTender[];
};

type CodelcoResult = {
  source: "codelco";
  listedCount: number;
  open: SampleTender[];
  staleWarning: string | null;
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};

type Result = MercadoPublicoResult | CodelcoResult;

const TIER_LABELS: [keyof TierCounts, string][] = [
  ["flagship", "重点大项目"],
  ["significant", "重要项目"],
  ["standard", "常规项目"],
  ["excluded", "已过滤"],
];

function SampleList({ tenders }: { tenders: SampleTender[] }) {
  if (tenders.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-[#eef1f2] pt-3 text-xs text-[#233846]">
      {tenders.map((t, index) => (
        <li key={`${t.slug}-${index}`} className="truncate">
          <span className="font-mono text-[#64717c]">{t.relevance.tier}</span>{" "}
          {t.estimatedValue ? `${t.currency ?? ""} ${Math.round(t.estimatedValue).toLocaleString()}` : "无金额"}
          {t.submissionDeadline ? ` · 截止 ${t.submissionDeadline.slice(0, 10)}` : ""} · {t.title.es}
        </li>
      ))}
    </ul>
  );
}

function WriteSummary({ result }: { result: Result }) {
  if (!result.write) return <p className="mt-2 text-xs text-[#64717c]">预览模式，没有写入 Supabase。</p>;
  const skipped = result.source === "mercadopublico" ? result.skippedExcludedCount : undefined;
  return (
    <>
      <p className="mt-2 text-xs text-[#233846]">
        已写入 Supabase {result.upsertedCount ?? 0} 条
        {skipped ? `，跳过已过滤 ${skipped} 条` : ""}
        {result.failed && result.failed.length > 0 ? `，失败 ${result.failed.length} 条` : ""}。
      </p>
      {result.failed && result.failed.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-700">
          {result.failed.slice(0, 5).map((f, index) => (
            <li key={`${f.slug}-${index}`}>
              {f.slug}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ResultPanel({ result }: { result: Result }) {
  return (
    <div className="mt-4 rounded-xl border border-[#d8e0e3] bg-white p-4">
      {result.staleWarning && (
        <p className="mb-2 whitespace-pre-line rounded-lg border border-[#f0d9a8] bg-[#fff8e9] px-3 py-2 text-xs text-[#7a5200]">{result.staleWarning}</p>
      )}
      {result.source === "mercadopublico" ? (
        <>
          <p className="text-sm font-bold text-[#071826]">
            在招 {result.fetchedCount} 条 → 近 2 个月发布 {result.keptAfterRecencyCount} 条 →{" "}
            <span className="text-[#b86e00]">进入推荐 {result.surfacedCount} 条</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#52636e]">
            {TIER_LABELS.map(([tier, label]) => (
              <span key={tier}>
                {label} <strong className="text-[#071826]">{result.tierCounts[tier]}</strong>
              </span>
            ))}
          </div>
          {result.write && (
            <p className="mt-1 text-xs text-[#52636e]">
              读到交标截止日 <strong className="text-[#071826]">{result.enrichedCount}</strong> 条
              {result.enrichedCount < result.surfacedCount ? "（没读到的，下一次每日任务会补上）" : ""}
            </p>
          )}
          <WriteSummary result={result} />
          <SampleList tenders={result.sample} />
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-[#071826]">
            表格 {result.listedCount} 行 → <span className="text-[#b86e00]">仍在报名期内 {result.open.length} 条</span>
          </p>
          {result.open.length === 0 && !result.staleWarning && (
            <p className="mt-1 text-xs text-[#64717c]">今天没有在报名期内的公开招标——Codelco 公开招标本来就少，这是正常的。</p>
          )}
          <WriteSummary result={result} />
          <SampleList tenders={result.open} />
        </>
      )}
    </div>
  );
}

function ErrorPanel({ error }: { error: { message: string; cliCommand?: string } }) {
  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <p>{error.message}</p>
      {error.cliCommand && (
        <p className="mt-2 border-t border-red-200 pt-2">
          线上部署可能连不上对方网站。可以在自己的电脑上跑：
          <code className="ml-1 break-all rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#071826]">{error.cliCommand}</code>
        </p>
      )}
    </div>
  );
}

export function ImportChileForm() {
  const [write, setWrite] = useState(false);
  const [running, setRunning] = useState<Source | null>(null);
  const [results, setResults] = useState<Partial<Record<Source, Result>>>({});
  const [errors, setErrors] = useState<Partial<Record<Source, { message: string; cliCommand?: string }>>>({});

  async function run(source: Source) {
    const label = source === "codelco" ? " Codelco " : " Mercado Público ";
    if (write && !confirm(`确定要把${label}的智利项目写入 Supabase 吗？`)) return;
    setRunning(source);
    setErrors((prev) => ({ ...prev, [source]: undefined }));
    try {
      const res = await fetch("/api/admin/import-chile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, write }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [source]: { message: data.error ?? `HTTP ${res.status}`, cliCommand: data.cliCommand } }));
        return;
      }
      setResults((prev) => ({ ...prev, [source]: data as Result }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, [source]: { message: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setRunning(null);
    }
  }

  function button(source: Source) {
    return (
      <button
        type="button"
        onClick={() => run(source)}
        disabled={running !== null}
        className="mt-4 h-9 rounded-lg bg-[#ffb21c] px-4 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
      >
        {running === source ? "运行中…" : write ? "拉取并写入" : "预览"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">共用设置</p>
        <label className="mt-3 flex items-center gap-2 text-xs text-[#233846]">
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="size-4 accent-[#ffb21c]" />
          写入 Supabase（不勾选则只预览）
        </label>
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Chile · 主渠道</p>
        <h2 className="mt-1 text-lg font-black text-[#071826]">Mercado Público — 政府公开招标</h2>
        <p className="mt-1 text-sm text-[#52636e]">
          读取 Mercado Público 公开搜索里<strong>所有在招项目</strong>，只保留近 2 个月发布、并通过筛选规则的（2026-09-25 约 70 条）。
          已删除的项目不会被重新导入。
        </p>
        <p className="mt-2 text-xs text-[#64717c]">
          预览只要几十秒（不读截止日）。写入时会逐条打开项目页读交标截止日，每条约 2.5 秒，最多用 200 秒——
          没来得及读的先写入，截止日由下一次每日任务补上，已有的截止日不会被清掉。
        </p>
        {errors.mercadopublico && <ErrorPanel error={errors.mercadopublico} />}
        {button("mercadopublico")}
        {results.mercadopublico && <ResultPanel result={results.mercadopublico} />}
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Chile · 矿业</p>
        <h2 className="mt-1 text-lg font-black text-[#071826]">Codelco — 公开招标（Licitaciones en proceso）</h2>
        <p className="mt-1 text-sm text-[#52636e]">
          Codelco 不在 Mercado Público 上。读取它官网的在招列表，只导入<strong>仍在报名期内</strong>的；
          标书在 SAP Ariba 上，需要先在官网报名（manifestación de interés）。
        </p>
        {errors.codelco && <ErrorPanel error={errors.codelco} />}
        {button("codelco")}
        {results.codelco && <ResultPanel result={results.codelco} />}
      </div>
    </div>
  );
}
