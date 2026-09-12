"use client";

import { useState } from "react";

/**
 * Web counterpart to `npm run explain:kept` — "which rule kept these?"
 *
 * Two things the CLI could not do, both of them the reason this exists:
 * it read a `reclassify:tenders` CSV export, so the answer was as old as the
 * last export and needed a terminal; and the export lives on whichever
 * machine produced it. This reads the live `tenders` table instead
 * (app/api/admin/explain-kept/route.ts), and the country filter covers
 * Mexico and Colombia exactly as it covers Peru — the `--country=` flag was
 * never Peru-specific, it just needed a CSV that happened to contain them.
 *
 * Read-only. Nothing here changes a single row; it is the thing you look at
 * BEFORE deciding to change a rule.
 */
type Bucket = {
  signal: string;
  count: number;
  byCountry: { country: string; count: number }[];
  examples: { slug: string; title: string; country: string; estimatedValue?: number; currency?: string }[];
};

type Result = {
  totalCount: number;
  grandTotalCount: number;
  countryCounts: { country: string; count: number }[];
  tierCounts: { flagship: number; significant: number; standard: number; excluded: number };
  country?: string;
  buckets: Bucket[];
};

const COUNTRY_OPTIONS = [
  { value: "", label: "全部国家" },
  { value: "Mexico", label: "墨西哥" },
  { value: "Colombia", label: "哥伦比亚" },
  { value: "Peru", label: "秘鲁" },
];

const COUNTRY_LABELS: Record<string, string> = { Mexico: "墨西哥", Colombia: "哥伦比亚", Peru: "秘鲁" };

function countryName(country: string): string {
  return COUNTRY_LABELS[country] ?? country;
}

function money(value: number | undefined, currency: string | undefined): string {
  if (value === undefined) return "无金额";
  return `${currency ?? ""} ${Math.round(value).toLocaleString()}`.trim();
}

export function ExplainKeptPanel() {
  const [country, setCountry] = useState("");
  const [examples, setExamples] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  /** The one bucket the admin asked to read in full — the server returns every title for it. */
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(signal?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/explain-kept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: country || undefined, examples, signal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as Result);
      setExpanded(signal ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <div className="border-b border-[#e5e9eb] pb-4">
        <h3 className="text-lg font-black text-[#071826]">保留原因分析</h3>
        <p className="mt-1 text-sm text-[#52636e]">
          把已入库的标书按「是哪条规则把它留下来的」分组。数字大的那一桶就是当前最松的规则——想收紧筛选时，先看这里，再改规则。
          只读，不会改动任何数据。
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-black text-[#52636e]">国家/地区</span>
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="h-10 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm font-bold text-[#233846] outline-none focus:border-[#ffb21c]"
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-black text-[#52636e]">每桶显示几条例子</span>
          <input
            type="number"
            min={1}
            max={50}
            value={examples}
            onChange={(event) => setExamples(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
            className="h-10 w-28 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm font-bold text-[#233846] outline-none focus:border-[#ffb21c]"
          />
        </label>
        <button
          type="button"
          onClick={() => run()}
          disabled={submitting}
          className="h-10 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "分析中…" : "分析保留原因"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}

      {result && (
        <div className="mt-5 border-t border-[#e5e9eb] pt-5">
          <p className="text-sm font-black text-[#071826]">
            {result.country ? `${countryName(result.country)}：` : "全部国家："}
            {result.totalCount.toLocaleString()} 条
            {result.country && <span className="font-bold text-[#64717c]">（全库 {result.grandTotalCount.toLocaleString()} 条）</span>}
          </p>
          <p className="mt-1 text-xs font-bold text-[#64717c]">
            重点大项目 {result.tierCounts.flagship} · 重要项目 {result.tierCounts.significant} · 常规项目 {result.tierCounts.standard}
            {!result.country && result.countryCounts.length > 1 && (
              <> · {result.countryCounts.map((item) => `${countryName(item.country)} ${item.count}`).join(" / ")}</>
            )}
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {result.buckets.map((bucket) => (
              <li key={bucket.signal} className="rounded-xl border border-[#e5e9eb] bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 break-words font-black text-[#071826]">
                    <span className="mr-2 inline-flex min-w-10 justify-center rounded-lg bg-[#071826] px-2 py-0.5 text-xs text-white">{bucket.count}</span>
                    {bucket.signal}
                  </p>
                  {bucket.count > bucket.examples.length && (
                    <button
                      type="button"
                      onClick={() => run(bucket.signal)}
                      disabled={submitting}
                      className="shrink-0 rounded-lg border border-[#cbd6da] bg-white px-2.5 py-1 text-[11px] font-black text-[#52636e] transition-colors hover:border-[#ffb21c] hover:text-[#071826] disabled:opacity-40"
                    >
                      展开全部 {bucket.count} 条
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] font-bold text-[#8a959c]">
                  {bucket.byCountry.map((item) => `${countryName(item.country)} ${item.count}`).join(" · ")}
                  {expanded === bucket.signal && <span className="ml-2 text-[#b86e00]">已展开全部</span>}
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {bucket.examples.map((example) => (
                    <li key={example.slug} className="text-[11px] leading-relaxed text-[#52636e]">
                      <span className="font-mono text-[10px] text-[#9aa5ab]">{money(example.estimatedValue, example.currency)}</span>{" "}
                      {example.title}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
