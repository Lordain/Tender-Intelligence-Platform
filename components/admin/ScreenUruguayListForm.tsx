"use client";

import { useState } from "react";
import { ARCE_SCREENED_IDS_KEY, extractArceLinks, screenedLabel, type ArceLink, type UruguayPasteResponse, type UruguayPasteRow } from "@/lib/ingestion/uruguay-paste-result";

/**
 * Hands the screened calls' ids to the detail step (ImportUruguayPasteForm):
 * some detail pages carry no link to themselves (user, 2026-10-16: 我点了写入
 * 的乌拉圭项目为什么没进系统？). Kept for the browser session, newest first.
 */
function rememberScreenedIds(rows: UruguayPasteRow[]) {
  try {
    const fresh: ArceLink[] = rows.filter((row) => row.purchaseId).map((row) => ({ label: screenedLabel(row.procedureNumber, row.buyer), purchaseId: row.purchaseId! }));
    const stored = JSON.parse(sessionStorage.getItem(ARCE_SCREENED_IDS_KEY) ?? "[]") as ArceLink[];
    const merged = [...fresh, ...stored.filter((old) => !fresh.some((link) => link.purchaseId === old.purchaseId))].slice(0, 1500);
    sessionStorage.setItem(ARCE_SCREENED_IDS_KEY, JSON.stringify(merged));
  } catch {
    // Storage blocked: the detail step then needs the page's own link or address.
  }
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

/** Montevideo wall-clock time (UTC-3), which is what ARCE showed. */
function montevideoDay(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-CN", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" });
}

/** The rules found nothing to size the call by; its items, on the detail page, may. */
function lacksInformation(row: UruguayPasteRow): boolean {
  return row.outcome === "excluded" && /未命中任何重点行业/.test(row.reasonZh);
}

function RowCard({ row, note }: { row: UruguayPasteRow; note?: string }) {
  return (
    <li className="rounded-xl border border-[#e5e9eb] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-[#071826]">{row.procedureNumber}</span>
        {row.url ? (
          <>
            <a href={row.url} target="_blank" rel="noreferrer" className="rounded-md border border-[#d8e0e3] px-1.5 py-0.5 text-[11px] font-bold text-[#b86e00] hover:bg-[#f4f6f7]">
              打开 ARCE 详情页 ↗
            </a>
            <button
              type="button"
              onClick={() => copy(row.url!)}
              className="rounded-md border border-[#d8e0e3] px-1.5 py-0.5 text-[11px] font-bold text-[#52636e] hover:bg-[#f4f6f7]"
            >
              复制链接
            </button>
          </>
        ) : (
          <span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-black text-[#8a5a00]">没读到链接，请在 ARCE 列表里点开</span>
        )}
        {row.existingSlug && <span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-black text-[#8a5a00]">平台上已有</span>}
      </div>
      <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
      <p className="mt-1 text-xs text-[#64717c]">
        {row.buyer} · 发布 {montevideoDay(row.publicationDate)} · 交标截止 {montevideoDay(row.submissionDeadline)}
      </p>
      <p className="mt-1 text-xs text-[#64717c]">{note ?? row.reasonZh}</p>
    </li>
  );
}

/**
 * 「ARCE 列表初筛」 (user, 2026-10-15: 应该是2层设计吧？1层是分析哪些项目值得录入),
 * the same two steps as Bolivia's (ScreenBoliviaListForm): the admin pastes
 * ARCE's 「Llamados vigentes」 list, several pages one after another; the
 * panel says which calls are worth opening, with each one's link, so only
 * those are opened and their detail pages pasted into 「ARCE 详情页粘贴导入」
 * below. Read-only. The links come from the HTML the browser copies with the
 * list, read on paste.
 */
export function ScreenUruguayListForm() {
  const [text, setText] = useState("");
  const [links, setLinks] = useState<ArceLink[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UruguayPasteResponse | null>(null);

  async function run() {
    if (!text.trim()) {
      setError("请先粘贴 ARCE「Llamados vigentes」列表页的内容。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/screen-uruguay-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, links }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as UruguayPasteResponse);
      rememberScreenedIds((data as UruguayPasteResponse).rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  const rows = result?.rows ?? [];
  const worth = rows.filter((row) => row.outcome === "write" || row.outcome === "short_window" || row.outcome === "no_id");
  const maybe = rows.filter(lacksInformation);
  const known = rows.filter((row) => row.outcome === "exists");
  const rest = rows.filter((row) => !worth.includes(row) && !maybe.includes(row) && !known.includes(row));
  const groups = new Map<string, UruguayPasteRow[]>();
  for (const row of rest) {
    const key = row.outcome === "closed" ? "交标截止日已过" : row.reasonZh.replace(/，?默认不进入推荐列表.*$/, "");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const notRead = (result?.notRead.reduce((sum, entry) => sum + entry.count, 0) ?? 0) + (result?.notProcurement ?? 0);
  const toOpen = [...worth, ...maybe].filter((row) => row.url);

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Screen</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">ARCE 列表初筛（第一步）</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        在 ARCE「Consulta de Publicaciones」选「Llamados vigentes」（正在招标），排序选「Fecha publicación」并取消「ascendente」，让最新的排在前面；Ctrl+A 全选、Ctrl+C 复制，直接粘贴到下面（不要先贴到记事本——项目链接在复制带过来的内容里）。翻页后的几页可以接着贴。平台按和每日自动导入相同的规则逐条判断，只列出值得打开的项目。这一步只做判断，不写入任何数据。打开这些项目的详情页、整页复制后，贴到下面的「ARCE 详情页粘贴导入」写入。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onPaste={(event) => {
          const html = event.clipboardData.getData("text/html");
          const found = html ? extractArceLinks(html) : [];
          if (found.length > 0) setLinks((current) => [...current, ...found]);
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (!event.target.value.trim()) setLinks([]);
          setResult(null);
        }}
        rows={8}
        placeholder={"Llamados vigentes | Todos los Organismos\n…\nLicitación Pública 103682/2026  Administración Nacional de Usinas y Trasmisiones Eléctricas | …\n…\nVer detalles de la compra Licitación Pública 103682/2026 | …"}
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
            {maybe.length > 0 && `，列表信息不足、可以打开看看 ${maybe.length} 个`}
            {known.length > 0 && `，平台上已有 ${known.length} 个`}，其余 {rest.length + notRead} 个不用打开。
          </p>
          {toOpen.length > 0 && (
            <button
              type="button"
              onClick={() => copy(toOpen.map((row) => row.url).join("\n"))}
              className="mt-2 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-black text-[#071826] hover:bg-[#f4f6f7]"
            >
              复制 {toOpen.length} 个待打开的链接
            </button>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {worth.map((row) => (
              <RowCard key={row.purchaseId ?? `${row.procedureNumber}|${row.buyer}`} row={row} />
            ))}
          </ul>
          {maybe.length > 0 && (
            <details className="mt-4 rounded-xl border border-[#e5e9eb] bg-white p-3" open>
              <summary className="cursor-pointer text-sm font-black text-[#071826]">列表信息不足、可以打开看看的 {maybe.length} 个</summary>
              <p className="mt-1 text-xs text-[#7a878f]">列表上只有一句描述，规则判断不了规模；详情页有物品清单，贴到第二步时会再按规则判断一次。</p>
              <ul className="mt-2 flex flex-col gap-3">
                {maybe.map((row) => (
                  <RowCard key={row.purchaseId ?? `${row.procedureNumber}|${row.buyer}`} row={row} note="只看列表判断不了规模，打开详情页看物品清单。" />
                ))}
              </ul>
            </details>
          )}
          {known.length > 0 && (
            <details className="mt-4 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <summary className="cursor-pointer text-sm font-black text-[#071826]">平台上已有的 {known.length} 个（不用再录）</summary>
              <ul className="mt-2 flex flex-col gap-0.5">
                {known.map((row) => (
                  <li key={row.purchaseId} className="break-words text-xs text-[#64717c]">
                    <span className="font-mono">{row.procedureNumber}</span> {row.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {rest.length + notRead > 0 && (
            <details className="mt-4 rounded-xl border border-[#e5e9eb] bg-white p-3">
              <summary className="cursor-pointer text-sm font-black text-[#071826]">不用打开的 {rest.length + notRead} 个（按原因分组）</summary>
              {notRead > 0 && (
                <p className="mt-3 text-xs font-black text-[#52636e]">
                  不在乌拉圭的读取范围内（{notRead}）：
                  <span className="font-normal">
                    {[...(result.notRead ?? []).map((entry) => `${entry.procedure} ${entry.count} 个`), ...(result.notProcurement ? [`资产出售/出租 ${result.notProcurement} 个`] : [])].join("、")}
                  </span>
                </p>
              )}
              {[...groups.entries()].map(([reason, grouped]) => (
                <div key={reason} className="mt-3">
                  <p className="text-xs font-black text-[#52636e]">
                    {reason}（{grouped.length}）
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {grouped.map((row) => (
                      <li key={row.purchaseId ?? `${row.procedureNumber}|${row.buyer}`} className="break-words text-xs text-[#64717c]">
                        <span className="font-mono">{row.procedureNumber}</span> {row.title}
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
