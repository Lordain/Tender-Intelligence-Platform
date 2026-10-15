"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  extractArceDocuments,
  extractArceLinks,
  URUGUAY_KEEP_TIERS,
  type ArceDetailPaste,
  type UruguayDetailResponse,
  type UruguayDetailRow,
  type UruguayKeepTier,
} from "@/lib/ingestion/uruguay-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const WRITES = new Set(["write", "short_window", "manual_keep"]);

/** Montevideo wall-clock time (UTC-3), which is what ARCE showed. */
function montevideoTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function OutcomeTag({ row }: { row: UruguayDetailRow }) {
  const className = WRITES.has(row.outcome) ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${className}`}>{row.outcomeZh}</span>;
}

/**
 * 「ARCE 详情页粘贴导入」 (user, 2026-10-15: 1层是录标书), the second step after
 * 「ARCE 列表初筛」, as in Bolivia (ImportBoliviaPasteForm): the admin opens a
 * call ARCE's list screening said is worth it, selects the page, copies and
 * pastes it here; several pages can be pasted one after another. Each paste
 * is kept with the links its HTML carried — the call's id, its pliego and
 * clarifications — since the plain text has none of them. Preview first,
 * then write; the same rules as the daily import decide what is written.
 */
export function ImportUruguayPasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  /** One entry per paste, in order. */
  const [pastes, setPastes] = useState<ArceDetailPaste[]>([]);
  const [submitting, setSubmitting] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UruguayDetailResponse | null>(null);
  /** purchase id → tier for excluded calls kept by hand. */
  const [keep, setKeep] = useState<Record<string, UruguayKeepTier>>({});

  async function run(write: boolean) {
    if (!text.trim()) {
      setError("请先粘贴 ARCE 项目详情页的内容。");
      return;
    }
    if (write && !confirm("确定要把这些乌拉圭项目写入数据库吗？")) return;
    setSubmitting(write ? "write" : "preview");
    setError(null);
    try {
      // Typed rather than pasted: the text alone, without links.
      const body = pastes.length > 0 ? pastes : [{ text, links: [], documents: [] }];
      const res = await fetch("/api/admin/import-uruguay-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pastes: body, write, keep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as UruguayDetailResponse);
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
  const withIds = pastes.filter((paste) => paste.links.length > 0).length;

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">ARCE 详情页粘贴导入（第二步）</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        打开第一步列出的项目（ARCE 详情页），Ctrl+A 全选、Ctrl+C 复制整页，直接粘贴到下面（不要先贴到记事本——项目 ID 和标书文件的链接在复制带过来的内容里）。可以一个接一个地贴多个项目。会连同物品清单、标书和澄清文件链接、开标时间、提问截止日一起写入；页面上的联系人邮箱和电话不保存。平台上已有的项目不会重复写入。筛选规则和每日自动导入相同。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onPaste={(event) => {
          const plain = event.clipboardData.getData("text/plain");
          const html = event.clipboardData.getData("text/html");
          if (!plain.trim()) return;
          setPastes((current) => [...current, { text: plain, links: html ? extractArceLinks(html) : [], documents: html ? extractArceDocuments(html) : [] }]);
        }}
        onChange={(event) => {
          setText(event.target.value);
          if (!event.target.value.trim()) setPastes([]);
          setResult(null);
          setKeep({});
        }}
        rows={10}
        placeholder={"InicioConsulta de PublicacionesPFI - Licitación pública internacional 27250/2026 Administración de las Obras Sanitarias del Estado | …\n…\n Recepción de ofertas hasta: 23/11/2026 14:00hs\nFecha Publicación: …\n…\nÍtems del llamado\nÍtem Nº 1  …"}
        className="mt-3 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
      />
      {pastes.length > 0 && (
        <p className={`mt-1 text-xs ${withIds === pastes.length ? "text-[#52636e]" : "font-semibold text-[#8a5a00]"}`}>
          已贴 {pastes.length} 页，其中 {withIds} 页读到了项目链接。
          {withIds < pastes.length && " 没读到链接的那页拿不到项目 ID，不能写入：请清空后在 ARCE 详情页上直接复制粘贴。"}
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
            识别到 {result.rows.length} 个项目，其中 {writable} 个会写入。
            {result.written !== undefined && <span className="font-semibold text-emerald-700"> 已写入 {result.written} 条{result.documentLinks ? `，标书链接 ${result.documentLinks} 个` : ""}。</span>}
            {result.failed && result.failed.length > 0 && <span className="font-semibold text-red-700"> {result.failed.length} 条失败：{result.failed.map((f) => f.error).join("；")}</span>}
          </p>
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
                <p className="mt-1 text-xs text-[#64717c]">
                  {row.buyer} · 物品 {row.items} 项 · 标书/澄清文件 {row.documents} 个 · 关键日期 {row.keyDates} 个
                </p>
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
