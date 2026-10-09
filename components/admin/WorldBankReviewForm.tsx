"use client";

import { useState } from "react";
import { countryLabel } from "@/lib/tender-labels";
import type { WorldBankReviewResponse } from "@/lib/ingestion/worldbank-review-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const OUTCOME: Record<string, { label: string; className: string }> = {
  review: { label: "待审：像库里已有的项目", className: "bg-[#fff3d6] text-[#8a5a00]" },
  write: { label: "每日任务会写入", className: "bg-[#e7f5ec] text-[#186a3b]" },
  duplicate: { label: "本国平台已有，不写入", className: "bg-[#eef1f2] text-[#52636e]" },
};

/**
 * The 世界银行 tab's review list (user, 2026-10-09: 可能的进后台待审). Reads
 * the World Bank's open calls and the stored rows on request — it takes a
 * few seconds per country — and writes only what is ticked.
 */
export function WorldBankReviewForm() {
  const [busy, setBusy] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorldBankReviewResponse | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  async function run(write: boolean) {
    if (write && !confirm(`确定写入选中的 ${chosen.size} 条吗？`)) return;
    setBusy(write ? "write" : "preview");
    setError(null);
    try {
      const res = await fetch("/api/admin/worldbank-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ write, ids: [...chosen] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as WorldBankReviewResponse);
      if (write) setChosen(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const order = { review: 0, write: 1, duplicate: 2 } as Record<string, number>;
  const rows = [...(result?.rows ?? [])].sort((a, b) => (order[a.outcome] ?? 3) - (order[b.outcome] ?? 3));

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">待审项目</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        读取近 60 天仍在招标的世界银行项目，并和库里同一国家其他来源的项目比对。「待审」是和库里某条项目有些像、但不确定是同一项目的，每日任务不会写入；确认不是同一项目后勾选写入。写入仍按平台规则筛选。读取 10 个国家需要几十秒。
      </p>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy !== null}
          className="rounded-xl border border-[#d8e0e3] bg-white px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#f4f6f7] disabled:opacity-50"
        >
          {busy === "preview" ? "读取中…" : "读取"}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy !== null || chosen.size === 0}
          className="rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {busy === "write" ? "写入中…" : `写入选中的 ${chosen.size} 条`}
        </button>
      </div>
      {result && (
        <div className="mt-4 border-t border-[#eef1f2] pt-3 text-sm text-[#52636e]">
          <p>
            仍在招标 {rows.length} 条，其中待审 {rows.filter((row) => row.outcome === "review").length} 条。
            {result.written !== undefined && <span className="font-semibold text-emerald-700"> 已写入 {result.written} 条。</span>}
            {result.failed && result.failed.length > 0 && <span className="font-semibold text-red-700"> {result.failed.length} 条失败：{result.failed.map((f) => f.error).join("；")}</span>}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {row.outcome !== "duplicate" && (
                    <input
                      type="checkbox"
                      aria-label={`选择 ${row.tenderNumber}`}
                      checked={chosen.has(row.id)}
                      onChange={(event) =>
                        setChosen((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                    />
                  )}
                  <span className="font-mono text-xs font-bold text-[#071826]">{row.tenderNumber}</span>
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{countryLabel(row.country, "zh")}</span>
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${OUTCOME[row.outcome]?.className ?? ""}`}>{OUTCOME[row.outcome]?.label ?? row.outcome}</span>
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
                <p className="mt-1 text-xs text-[#64717c]">
                  {row.buyer} · 交标截止 {row.submissionDeadline?.slice(0, 10) ?? "—"} ·{" "}
                  <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="text-[#b86e00] hover:underline">
                    世界银行公告
                  </a>
                </p>
                {row.matchSlug && (
                  <p className="mt-1 text-xs text-[#64717c]">
                    库里相似的：
                    <a href={`/admin/tenders/${row.matchSlug}`} className="text-[#b86e00] hover:underline">
                      {row.matchTitle?.slice(0, 120) ?? row.matchSlug}
                    </a>
                    （{row.matchSource ?? "—"}）
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
