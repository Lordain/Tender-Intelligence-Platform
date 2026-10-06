"use client";

import { useState } from "react";
import type { CfePasteResponse, CfePasteRow } from "@/lib/ingestion/cfe-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const SCOPE_LABEL: Record<string, string> = { works: "工程", equipment: "货物", services: "服务", unknown: "未注明" };

/** Mexico City wall-clock time, which is what the micrositio page showed. */
function mexicoTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function OutcomeTag({ row }: { row: CfePasteRow }) {
  const className = row.outcome === "write" || row.outcome === "short_window" ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${className}`}>{row.outcomeZh}</span>;
}

/**
 * 「CFE 网站粘贴导入」 (user, 2026-10-06: 比如我直接复制整个页面). The admin opens
 * a procedure on CFE's micrositio, selects the whole page, copies and pastes
 * it here; several pages can be pasted one after another. Preview first, then
 * write — the same rules as every other import decide what is written.
 */
export function ImportCfePasteForm() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CfePasteResponse | null>(null);

  async function run(write: boolean) {
    if (!text.trim()) {
      setError("请先粘贴 CFE 项目详情页的内容。");
      return;
    }
    if (write && !confirm("确定要把这些 CFE 项目写入数据库吗？")) return;
    setSubmitting(write ? "write" : "preview");
    setError(null);
    try {
      const res = await fetch("/api/admin/import-cfe-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, write }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as CfePasteResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(null);
    }
  }

  const writable = result?.rows.filter((row) => row.outcome === "write" || row.outcome === "short_window").length ?? 0;

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Paste</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">CFE 网站粘贴导入</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        在 CFE 招标网站（msc.cfe.mx）打开项目详情页，全选（Ctrl/⌘ + A）、复制，粘贴到下面。可以连续贴多个项目。DOF
        不刊登的工程类和简化招标（编号里有 CON 或 CS）只能用这种方式补录。同一个编号如果已经从 DOF 导入过，会更新那一条，不会重复；之后
        DOF 再刊登时也会跳过。筛选规则和自动导入相同，只有「发布到交标不足 12 天」这一条对手动粘贴不适用。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
        }}
        rows={10}
        placeholder={"Procedimiento No. CFE-0115-CACON-0057-2026\nDatos Generales …"}
        className="mt-4 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
      />

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
        <div className="mt-4 border-t border-[#e5e9eb] pt-4 text-sm text-[#52636e]">
          <p>
            识别到 {result.rows.length} 个项目，其中 {writable} 个会写入。
            {result.written !== undefined && <span className="font-semibold text-emerald-700"> 已写入 {result.written} 条。</span>}
            {result.failed && result.failed.length > 0 && <span className="font-semibold text-red-700"> {result.failed.length} 条失败：{result.failed.map((f) => f.error).join("；")}</span>}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {result.rows.map((row) => (
              <li key={row.number} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#071826]">{row.number}</span>
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <OutcomeTag row={row} />
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
                <p className="mt-1 text-xs text-[#64717c]">
                  {row.buyer}
                  {row.location ? ` · ${row.location}` : ""} · {row.procedureType} · {SCOPE_LABEL[row.scopeType] ?? row.scopeType}
                </p>
                <p className="mt-1 text-xs text-[#64717c]">
                  发布 {mexicoTime(row.publicationDate)} · 交标截止 {mexicoTime(row.submissionDeadline)}（墨西哥城时间） · 关键日期 {row.keyDates} 个 · 文件 {row.files} 个
                </p>
                <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
                {row.existingSlug && <p className="mt-1 text-xs font-semibold text-[#8a5a00]">平台上已有这个编号（{row.existingSlug}），写入时更新那一条，不新增。</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
