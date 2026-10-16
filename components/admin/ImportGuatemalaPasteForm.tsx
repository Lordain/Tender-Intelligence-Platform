"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  extractGuatecomprasLinks,
  GUATEMALA_KEEP_TIERS,
  type GuatemalaDetailPaste,
  type GuatemalaDetailResponse,
  type GuatemalaDetailRow,
  type GuatemalaKeepTier,
} from "@/lib/ingestion/guatemala-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const WRITES = new Set(["write", "short_window", "manual_keep"]);

/** Guatemala City wall-clock time (UTC-6), which is what Guatecompras showed. */
function guatemalaTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function OutcomeTag({ row }: { row: GuatemalaDetailRow }) {
  const className = WRITES.has(row.outcome) ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${className}`}>{row.outcomeZh}</span>;
}

/**
 * 「Guatecompras 详情页粘贴导入」, the second step after 「Guatecompras 列表初筛」,
 * as Uruguay's (ImportUruguayPasteForm): the admin opens a call the screening
 * said is worth it, selects the page, copies and pastes it here; several
 * pages can be pasted one after another. The NOG is in the page's text; the
 * link to the page comes from the HTML the browser copies with it. Preview
 * first, then write.
 */
export function ImportGuatemalaPasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  /** One entry per paste, in order. */
  const [pastes, setPastes] = useState<GuatemalaDetailPaste[]>([]);
  const [submitting, setSubmitting] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuatemalaDetailResponse | null>(null);
  /** NOG → tier for excluded calls kept by hand. */
  const [keep, setKeep] = useState<Record<string, GuatemalaKeepTier>>({});

  async function run(write: boolean) {
    if (!text.trim()) {
      setError("请先粘贴 Guatecompras 项目详情页的内容。");
      return;
    }
    if (write && !confirm("确定要把这些危地马拉项目写入数据库吗？（只在后台可见）")) return;
    setSubmitting(write ? "write" : "preview");
    setError(null);
    try {
      // Typed rather than pasted: the text alone, without links.
      const body = pastes.length > 0 ? pastes : [{ text, links: [] }];
      const res = await fetch("/api/admin/import-guatemala-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pastes: body, write, keep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as GuatemalaDetailResponse);
      // The imported list below is rendered on the server; re-read it.
      if (write) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(null);
    }
  }

  const writable = result?.rows.filter((row) => WRITES.has(row.outcome) || (row.outcome === "excluded" && keep[row.nog])).length ?? 0;

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">Guatecompras 详情页粘贴导入（第二步）</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        打开第一步列出的项目（Guatecompras「Detalle de concurso」页），Ctrl+A 全选、Ctrl+C 复制整页，直接粘贴到下面。可以一个接一个地贴多个项目。会连同截标时间、保证金比例、是否为公共投资项目（SNIP）一起写入。平台上已有的项目不会重复写入。筛选规则和第一步相同。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onPaste={(event) => {
          const plain = event.clipboardData.getData("text/plain");
          const html = event.clipboardData.getData("text/html");
          if (!plain.trim()) return;
          setPastes((current) => [...current, { text: plain, links: html ? extractGuatecomprasLinks(html) : [] }]);
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (!event.target.value.trim()) setPastes([]);
          setResult(null);
          setKeep({});
        }}
        rows={10}
        placeholder={"Detalle de concurso\nNOG:\n31330665\nDescripción:\nADQUISICIÓN DE TRACTORES …\nModalidad:\nLicitación Pública (Art. 17 LCE)\n…\nFecha de cierre de recepción de ofertas:\n26.noviembre.2026 10:00:00 a.m."}
        className="mt-3 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
      />
      {pastes.length > 0 && <p className="mt-1 text-xs text-[#52636e]">已贴 {pastes.length} 页。</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={submitting !== null}
          className="rounded-xl border border-[#d8e0e3] bg-white px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#f4f6f7] disabled:opacity-50"
        >
          {submitting === "preview" ? "解析中…" : "预览"}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={submitting !== null || (result !== null && writable === 0)}
          className="rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
        >
          {submitting === "write" ? "写入中…" : "写入"}
        </button>
      </div>

      {result && (
        <div className="mt-4 border-t border-[#eef1f2] pt-3 text-sm text-[#52636e]">
          <p>
            识别到 {result.rows.length} 个项目，其中 {writable} 个会写入。
            {result.written !== undefined && <span className="font-semibold text-emerald-700"> 已写入 {result.written} 条（只在后台可见）。</span>}
            {result.failed && result.failed.length > 0 && <span className="font-semibold text-red-700"> {result.failed.length} 条失败：{result.failed.map((f) => f.error).join("；")}</span>}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {result.rows.map((row) => (
              <li key={row.nog} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#071826]">NOG {row.nog}</span>
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <OutcomeTag row={row} />
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
                <p className="mt-1 text-xs text-[#64717c]">
                  {row.buyer}
                  {row.snip && " · 公共投资项目（SNIP）"}
                  {row.bonds && ` · ${row.bonds}`} · 关键日期 {row.keyDates} 个
                </p>
                <p className="mt-1 text-xs text-[#64717c]">
                  发布 {guatemalaTime(row.publicationDate)} · 截标 {guatemalaTime(row.submissionDeadline)}（危地马拉时间）
                  {" · "}
                  <a href={row.url} target="_blank" rel="noreferrer" className="text-[#b86e00] hover:underline">
                    Guatecompras 原文
                  </a>
                </p>
                <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
                {(row.outcome === "excluded" || row.outcome === "manual_keep") && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#233846]">
                    手动保留
                    <select
                      value={keep[row.nog] ?? ""}
                      onChange={(event) => {
                        const tier = event.target.value as GuatemalaKeepTier | "";
                        setKeep((current) => {
                          const next = { ...current };
                          if (tier) next[row.nog] = tier;
                          else delete next[row.nog];
                          return next;
                        });
                      }}
                      className="h-8 rounded-lg border border-[#d8e0e3] bg-white px-2 text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
                    >
                      <option value="">不保留（按规则排除）</option>
                      {GUATEMALA_KEEP_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          保留为「{TIER_LABEL[tier]}」
                        </option>
                      ))}
                    </select>
                    <span className="font-normal text-[#7a878f]">选了就会写入，并锁定为你选的档位（和在项目管理里手动改档位一样），以后重新导入不会被覆盖。</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
