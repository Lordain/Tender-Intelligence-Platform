"use client";

import { useState } from "react";
import { extractGuatecomprasLinks, type GuatecomprasLink, type GuatemalaPasteResponse, type GuatemalaPasteRow } from "@/lib/ingestion/guatemala-paste-result";

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

/** Guatemala City wall-clock day (UTC-6), which is what Guatecompras shows. */
function guatemalaDay(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-CN", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit" });
}

function RowCard({ row }: { row: GuatemalaPasteRow }) {
  return (
    <li className="rounded-xl border border-[#e5e9eb] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-[#071826]">NOG {row.nog}</span>
        <a href={row.url} target="_blank" rel="noreferrer" className="rounded-md border border-[#d8e0e3] px-1.5 py-0.5 text-[11px] font-bold text-[#b86e00] hover:bg-[#f4f6f7]">
          打开 Guatecompras 详情页 ↗
        </a>
        <button
          type="button"
          onClick={() => copy(row.url)}
          className="rounded-md border border-[#d8e0e3] px-1.5 py-0.5 text-[11px] font-bold text-[#52636e] hover:bg-[#f4f6f7]"
        >
          复制链接
        </button>
        {row.existingSlug && <span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-black text-[#8a5a00]">平台上已有</span>}
      </div>
      <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
      <p className="mt-1 text-xs text-[#64717c]">
        {row.buyer} · 发布 {guatemalaDay(row.publicationDate)} · 截标 {guatemalaDay(row.submissionDeadline)}
      </p>
      <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
    </li>
  );
}

/**
 * 「Guatecompras 列表初筛」 (user, 2026-10-16: A — 两步粘贴导入), the same two
 * steps as Uruguay's (ScreenUruguayListForm): the admin pastes the
 * 「Concursos vigentes」 list filtered to Licitación Pública; the panel says
 * which calls are worth opening, with each one's link, so only those are
 * opened and their pages pasted into 「Guatecompras 详情页粘贴导入」 below.
 * Read-only. Links come from the HTML the browser copies with the list.
 */
export function ScreenGuatemalaListForm() {
  const [text, setText] = useState("");
  const [links, setLinks] = useState<GuatecomprasLink[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuatemalaPasteResponse | null>(null);

  async function run() {
    if (!text.trim()) {
      setError("请先粘贴 Guatecompras「Concursos vigentes」列表页的内容。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/screen-guatemala-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, links }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as GuatemalaPasteResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  const rows = result?.rows ?? [];
  const worth = rows.filter((row) => row.outcome === "write" || row.outcome === "short_window");
  const known = rows.filter((row) => row.outcome === "exists");
  const local = rows.filter((row) => row.municipal && row.outcome === "excluded");
  const rest = rows.filter((row) => !worth.includes(row) && !known.includes(row) && !local.includes(row));
  const groups = new Map<string, GuatemalaPasteRow[]>();
  for (const row of rest) {
    const key = row.outcome === "closed" ? "截标日已过" : row.reasonZh.replace(/，?默认不进入推荐列表.*$/, "");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const notRead = result?.notRead.reduce((sum, entry) => sum + entry.count, 0) ?? 0;

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Screen</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">Guatecompras 列表初筛（第一步）</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        在 Guatecompras「Concursos vigentes」页面上方的统计表里点「Licitación Pública (Art. 17 LCE)」，列表按发布时间排序、最新的在前；Ctrl+A 全选、Ctrl+C 复制，直接粘贴到下面（不要先贴到记事本——项目链接在复制带过来的内容里）。每天贴第 1 页即可，翻页后的几页可以接着贴。平台只收中央部委、国有企业和自治机构的项目，地方政府（市政府等）的不收。这一步只做判断，不写入任何数据。打开值得的项目、整页复制后，贴到下面的「Guatecompras 详情页粘贴导入」写入。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onPaste={(event) => {
          const html = event.clipboardData.getData("text/html");
          const found = html ? extractGuatecomprasLinks(html) : [];
          if (found.length > 0) setLinks((current) => [...current, ...found]);
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (!event.target.value.trim()) setLinks([]);
          setResult(null);
        }}
        rows={8}
        placeholder={"Consulta de concursos VIGENTES\n…\nListado de Concurso\n31330665\n14.oct..2026\n26.nov..2026\n Público\nVigente\nMINISTERIO DE COMUNICACIONES, INFRAESTRUCTURA Y VIVIENDA\n…\nLicitación Pública (Art. 17 LCE)"}
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
            识别到 {rows.length + notRead} 个项目：<span className="font-black text-[#186a3b]">值得打开 {worth.length} 个</span>
            {known.length > 0 && `，平台上已有 ${known.length} 个`}
            {local.length > 0 && `，地方政府的 ${local.length} 个不收`}，其余 {rest.length + notRead} 个不用打开。
          </p>
          {worth.length > 0 && (
            <button
              type="button"
              onClick={() => copy(worth.map((row) => row.url).join("\n"))}
              className="mt-2 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-black text-[#071826] hover:bg-[#f4f6f7]"
            >
              复制 {worth.length} 个待打开的链接
            </button>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {worth.map((row) => (
              <RowCard key={row.nog} row={row} />
            ))}
          </ul>
          {known.length > 0 && (
            <details className="mt-4 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <summary className="cursor-pointer text-sm font-black text-[#071826]">平台上已有的 {known.length} 个（不用再录）</summary>
              <ul className="mt-2 flex flex-col gap-0.5">
                {known.map((row) => (
                  <li key={row.nog} className="break-words text-xs text-[#64717c]">
                    <span className="font-mono">NOG {row.nog}</span> {row.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {local.length + rest.length + notRead > 0 && (
            <details className="mt-4 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <summary className="cursor-pointer text-sm font-black text-[#071826]">不用打开的 {local.length + rest.length + notRead} 个（按原因分组）</summary>
              {notRead > 0 && (
                <p className="mt-3 text-xs font-black text-[#52636e]">
                  不在危地马拉的读取范围内（{notRead}）：
                  <span className="font-normal">{result.notRead.map((entry) => `${entry.modality} ${entry.count} 个`).join("、")}</span>
                </p>
              )}
              {local.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-black text-[#52636e]">地方政府（市政府等）的项目，按收录规则不收（{local.length}）</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {local.map((row) => (
                      <li key={row.nog} className="break-words text-xs text-[#64717c]">
                        <span className="font-mono">NOG {row.nog}</span> {row.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {[...groups.entries()].map(([reason, grouped]) => (
                <div key={reason} className="mt-3">
                  <p className="text-xs font-black text-[#52636e]">
                    {reason}（{grouped.length}）
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {grouped.map((row) => (
                      <li key={row.nog} className="break-words text-xs text-[#64717c]">
                        <span className="font-mono">NOG {row.nog}</span> {row.title}
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
