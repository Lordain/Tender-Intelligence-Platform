"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  extractArceLinks,
  URUGUAY_KEEP_TIERS,
  type ArceLink,
  type UruguayKeepTier,
  type UruguayPasteResponse,
  type UruguayPasteRow,
} from "@/lib/ingestion/uruguay-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const WRITES = new Set(["write", "short_window", "manual_keep"]);

/** Montevideo wall-clock time (UTC-3), which is what ARCE showed. */
function montevideoTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function OutcomeTag({ row }: { row: UruguayPasteRow }) {
  const className = WRITES.has(row.outcome) ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${className}`}>{row.outcomeZh}</span>;
}

/**
 * 「ARCE 列表粘贴导入」 (user, 2026-10-15), for while ARCE refuses our servers:
 * the admin copies ARCE's 「Llamados vigentes」 list and pastes it here.
 * The plain text has no purchase id, so the paste also reads the HTML the
 * browser copies with it, where each 「Ver detalles de la compra」 link carries
 * the id. Preview first, then write — the same rules as the daily import
 * decide what is written, as in the Bolivia paste (ImportBoliviaPasteForm).
 */
export function ImportUruguayPasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [links, setLinks] = useState<ArceLink[]>([]);
  const [submitting, setSubmitting] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UruguayPasteResponse | null>(null);
  /** purchase id → tier for excluded calls kept by hand. */
  const [keep, setKeep] = useState<Record<string, UruguayKeepTier>>({});

  async function run(write: boolean) {
    if (!text.trim()) {
      setError("请先粘贴 ARCE「Llamados vigentes」列表页的内容。");
      return;
    }
    if (write && !confirm("确定要把这些乌拉圭项目写入数据库吗？")) return;
    setSubmitting(write ? "write" : "preview");
    setError(null);
    try {
      const res = await fetch("/api/admin/import-uruguay-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, links, write, keep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as UruguayPasteResponse);
      // The imported list below is rendered on the server; re-read it.
      if (write) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(null);
    }
  }

  const writable = result?.rows.filter((row) => WRITES.has(row.outcome) || (row.outcome === "excluded" && row.purchaseId && keep[row.purchaseId])).length ?? 0;
  const skipped = (result?.notRead.reduce((sum, entry) => sum + entry.count, 0) ?? 0) + (result?.notProcurement ?? 0);

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">ARCE 列表粘贴导入</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        在 ARCE「Consulta de Publicaciones」打开「Llamados vigentes」（正在招标）列表，Ctrl+A 全选、Ctrl+C 复制，直接粘贴到下面（不要先贴到记事本——项目 ID 在复制带过来的链接里）。列表有多页时可以一页一页接着贴，重复的项目只算一次。
        只读公开招标（含 PFI 国际招标）和 UTE、ANCAP、OSE、ANP、AFE、交通部的简易招标；资产出售/出租、比价采购等不读。平台上已有的项目不会重复写入。筛选规则和每日自动导入相同。
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
          setKeep({});
        }}
        rows={10}
        placeholder={"Llamados vigentes | Todos los Organismos\n…\nLicitación Pública 103682/2026  Administración Nacional de Usinas y Trasmisiones Eléctricas | …\n…\nVer detalles de la compra Licitación Pública 103682/2026 | …"}
        className="mt-3 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
      />
      {text.trim() && (
        <p className={`mt-1 text-xs ${links.length > 0 ? "text-[#52636e]" : "font-semibold text-[#8a5a00]"}`}>
          {links.length > 0 ? `已从复制的链接里读到 ${new Set(links.map((link) => link.purchaseId)).size} 个项目 ID。` : "没有读到项目 ID：请清空后从 ARCE 列表页直接复制粘贴（没有 ID 的项目不能写入）。"}
        </p>
      )}

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
            读取范围内 {result.rows.length} 个项目，其中 {writable} 个会写入。
            {result.written !== undefined && <span className="font-semibold text-emerald-700"> 已写入 {result.written} 条。</span>}
            {result.failed && result.failed.length > 0 && <span className="font-semibold text-red-700"> {result.failed.length} 条失败：{result.failed.map((f) => f.error).join("；")}</span>}
          </p>
          {skipped > 0 && (
            <p className="mt-1 text-xs text-[#7a878f]">
              不读 {skipped} 个：
              {[...result.notRead.map((entry) => `${entry.procedure} ${entry.count} 个`), ...(result.notProcurement ? [`资产出售/出租 ${result.notProcurement} 个`] : [])].join("、")}
              （不在乌拉圭的读取范围内）。
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {result.rows.map((row) => (
              <li key={row.purchaseId ?? `${row.procedureNumber}|${row.buyer}`} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#071826]">{row.procedureNumber}</span>
                  {row.purchaseId && <span className="font-mono text-[11px] text-[#8a959c]">ID {row.purchaseId}</span>}
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <OutcomeTag row={row} />
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
                <p className="mt-1 text-xs text-[#64717c]">{row.buyer}</p>
                <p className="mt-1 text-xs text-[#64717c]">
                  发布 {montevideoTime(row.publicationDate)} · 交标截止 {montevideoTime(row.submissionDeadline)}（蒙得维的亚时间）
                  {row.url && (
                    <>
                      {" · "}
                      <a href={row.url} target="_blank" rel="noreferrer" className="text-[#b86e00] hover:underline">
                        ARCE 原文
                      </a>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
                {row.purchaseId && (row.outcome === "excluded" || row.outcome === "manual_keep") && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#233846]">
                    手动保留
                    <select
                      value={keep[row.purchaseId] ?? ""}
                      onChange={(event) => {
                        const id = row.purchaseId!;
                        const tier = event.target.value as UruguayKeepTier | "";
                        setKeep((current) => {
                          const next = { ...current };
                          if (tier) next[id] = tier;
                          else delete next[id];
                          return next;
                        });
                      }}
                      className="h-8 rounded-lg border border-[#d8e0e3] bg-white px-2 text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
                    >
                      <option value="">不保留（按规则排除）</option>
                      {URUGUAY_KEEP_TIERS.map((tier) => (
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
