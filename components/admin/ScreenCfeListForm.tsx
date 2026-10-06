"use client";

import { useState } from "react";
import type { CfeListScreenResponse, CfeListScreenRow } from "@/lib/ingestion/cfe-list-screen";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function RowCard({ row }: { row: CfeListScreenRow }) {
  return (
    <li className="rounded-xl border border-[#e5e9eb] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-[#071826]">{row.number}</span>
        <button
          type="button"
          onClick={() => copy(row.number)}
          className="rounded-md border border-[#d8e0e3] px-1.5 py-0.5 text-[11px] font-bold text-[#52636e] hover:bg-[#f4f6f7]"
        >
          复制编号
        </button>
        {row.tier && row.tier !== "excluded" && (
          <span className="rounded-full bg-[#e7f5ec] px-2 py-0.5 text-[11px] font-black text-[#186a3b]">{TIER_LABEL[row.tier]}</span>
        )}
        {row.existingSlug && <span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-black text-[#8a5a00]">平台上已有</span>}
      </div>
      <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.description}</p>
      <p className="mt-1 text-xs text-[#64717c]">
        {row.state ? `${row.state} · ` : ""}
        {row.procedureType} · {row.contractType} · 发布 {row.published}
      </p>
      <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
    </li>
  );
}

/**
 * 「CFE 列表初筛」 (user, 2026-10-06: 帮我增加CFE的第一层筛选和识别…告诉我哪些值得
 * 进一步). The admin pastes CFE's search-result list; the panel says which rows
 * pass CFE's rules from the list alone, so only those are opened and pasted
 * into 「CFE 网站粘贴导入」 below. Read-only.
 */
export function ScreenCfeListForm() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CfeListScreenResponse | null>(null);

  async function run() {
    if (!text.trim()) {
      setError("请先粘贴 CFE 网站的搜索结果列表。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/screen-cfe-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as CfeListScreenResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  const worth = result?.rows.filter((row) => row.verdict === "open") ?? [];
  const fresh = worth.filter((row) => !row.existingSlug);
  const rest = result?.rows.filter((row) => row.verdict !== "open") ?? [];
  const groups = new Map<string, CfeListScreenRow[]>();
  for (const row of rest) {
    const key = row.reasonZh.replace(/，?默认不进入推荐列表.*$/, "");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Screen</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">CFE 列表初筛（第一步）</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        在 CFE 招标网站搜索后，把结果列表（从「Procedimientos Encontrados」或表头开始，连同各行）复制，粘贴到下面。平台按 CFE
        的筛选规则逐条判断，只列出值得打开的项目。这一步只做判断，不写入任何数据。打开这些项目的详情页、整页复制后，贴到下面的「CFE
        网站粘贴导入」写入。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
        }}
        rows={8}
        placeholder={"Procedimientos Encontrados: …\nCFE-0001-CAAAT-0163-2026\nNO\nCiudad de México\tAdquisición de Conductores y cables …\tConcurso abierto\t…"}
        className="mt-4 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={run}
          disabled={submitting}
          className="rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting ? "判断中…" : "初筛"}
        </button>
      </div>

      {result && (
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            识别到 {result.total} 个项目：<span className="font-black text-[#186a3b]">值得打开 {worth.length} 个</span>
            {worth.length > fresh.length && `（其中 ${worth.length - fresh.length} 个平台上已有，可跳过）`}，其余 {rest.length} 个不用打开。
          </p>
          {fresh.length > 0 && (
            <button
              type="button"
              onClick={() => copy(fresh.map((row) => row.number).join("\n"))}
              className="mt-2 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-black text-[#071826] hover:bg-[#f4f6f7]"
            >
              复制 {fresh.length} 个待打开的编号
            </button>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {worth.map((row) => (
              <RowCard key={row.number} row={row} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="mt-4 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <summary className="cursor-pointer text-sm font-black text-[#071826]">不用打开的 {rest.length} 个（按原因分组）</summary>
              {[...groups.entries()].map(([reason, rows]) => (
                <div key={reason} className="mt-3">
                  <p className="text-xs font-black text-[#52636e]">
                    {reason}（{rows.length}）
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {rows.map((row) => (
                      <li key={row.number} className="break-words text-xs text-[#64717c]">
                        <span className="font-mono">{row.number}</span> {row.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
