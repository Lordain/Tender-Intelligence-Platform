"use client";

import { useState } from "react";
import type { BoliviaListScreenResponse, BoliviaListScreenRow } from "@/lib/ingestion/bolivia-list-screen";

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function RowCard({ row }: { row: BoliviaListScreenRow }) {
  return (
    <li className="rounded-xl border border-[#e5e9eb] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-[#071826]">{row.cuce}</span>
        <button
          type="button"
          onClick={() => copy(row.cuce)}
          className="rounded-md border border-[#d8e0e3] px-1.5 py-0.5 text-[11px] font-bold text-[#52636e] hover:bg-[#f4f6f7]"
        >
          复制 CUCE
        </button>
        {row.lenderProcedure && <span className="rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[11px] font-black text-[#1f4f8a]">国际机构出资方式</span>}
        {row.existingSlug && <span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-black text-[#8a5a00]">平台上已有</span>}
      </div>
      <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.object}</p>
      <p className="mt-1 text-xs text-[#64717c]">
        {row.entity} · {row.modality} · {row.contractType} · 发布 {row.published} · 交标截止 {row.submission || "—"}
      </p>
      <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
    </li>
  );
}

/**
 * 「SICOES 列表初筛」 (user, 2026-10-09: 能不能也做成两层？… 但是我会贴好几页).
 * The admin pastes SICOES's Convocatorias results, several pages one after
 * another; the panel says which rows are worth opening from the list alone,
 * so only those are opened (Ver Ficha) and pasted into 「SICOES 粘贴导入」
 * below. Read-only.
 */
export function ScreenBoliviaListForm() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BoliviaListScreenResponse | null>(null);

  async function run() {
    if (!text.trim()) {
      setError("请先粘贴 SICOES 的搜索结果列表。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/screen-bolivia-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as BoliviaListScreenResponse);
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
  const groups = new Map<string, BoliviaListScreenRow[]>();
  for (const row of rest) {
    const key = row.reasonZh.replace(/，?默认不进入推荐列表.*$/, "");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Screen</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">SICOES 列表初筛（第一步）</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        在 SICOES「Convocatorias」搜索（Modalidad 选 Licitación Pública 或不选，Estado 选 Vigente，Monto 从 7000000 起），把结果列表从表头「CUCE」开始连同各行复制，粘贴到下面；翻页后的几页可以接着贴在一起。平台逐条判断，只列出值得打开的项目。这一步只做判断，不写入任何数据。打开这些项目的「Ver Ficha」、整页复制后，贴到下面的「SICOES 粘贴导入」写入。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
        }}
        rows={8}
        placeholder={"CUCE:\tEntidad:\tTipo Contratación:\tModalidad:\t…\n26-1704-00-1694954-1-1\tGobierno Autonomo Municipal De La Guardia\tObras\tLP\tConst. …\tSi\t09/10/2026\t03/11/2026\tVigente\t…"}
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
              onClick={() => copy(fresh.map((row) => row.cuce).join("\n"))}
              className="mt-2 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-black text-[#071826] hover:bg-[#f4f6f7]"
            >
              复制 {fresh.length} 个待打开的 CUCE
            </button>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {worth.map((row) => (
              <RowCard key={row.cuce} row={row} />
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
                      <li key={row.cuce} className="break-words text-xs text-[#64717c]">
                        <span className="font-mono">{row.cuce}</span> {row.object}
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
