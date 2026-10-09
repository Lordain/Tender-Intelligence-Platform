"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BOLIVIA_KEEP_TIERS, type BoliviaImportResponse, type BoliviaImportRow, type BoliviaKeepTier } from "@/lib/ingestion/bolivia-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const SCOPE_LABEL: Record<string, string> = { works: "工程", equipment: "货物", services: "服务", equipment_services: "货物和服务", consulting: "咨询", unknown: "未注明" };

/** Bolivia wall-clock time (UTC-4), which is what SICOES showed. */
function boliviaTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function money(row: BoliviaImportRow): string {
  if (row.budget === undefined) return "未写金额";
  const own = `${row.currency === "USD" ? "US$" : "Bs "}${row.budget.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return row.currency !== "USD" && row.budgetUsd !== undefined ? `${own}（约 US$${Math.round(row.budgetUsd).toLocaleString("en-US")}）` : own;
}

const WRITES = new Set(["write", "short_window", "manual_keep"]);

function OutcomeTag({ row }: { row: BoliviaImportRow }) {
  const className = WRITES.has(row.outcome) ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${className}`}>{row.outcomeZh}</span>;
}

/**
 * 「SICOES 粘贴导入」 (user, 2026-10-09), the same flow as Ecuador's
 * (ImportEcuadorPasteForm): the admin opens a process's 「Ver Ficha」 on
 * SICOES, selects the page, copies and pastes it here; several pages can be
 * pasted one after another. Preview first, then write — the same rules as
 * every other import decide what is written, and an excluded process can be
 * kept by hand at a chosen tier.
 */
export function ImportBoliviaPasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BoliviaImportResponse | null>(null);
  /** CUCE → tier for excluded processes kept by hand. */
  const [keep, setKeep] = useState<Record<string, BoliviaKeepTier>>({});

  async function run(write: boolean) {
    if (!text.trim()) {
      setError("请先粘贴 SICOES 项目详情页（Ver Ficha）的内容。");
      return;
    }
    if (write && !confirm("确定要把这些玻利维亚项目写入数据库吗？（玻利维亚未公开，只在后台可见）")) return;
    setSubmitting(write ? "write" : "preview");
    setError(null);
    try {
      const res = await fetch("/api/admin/import-bolivia-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, write, keep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as BoliviaImportResponse);
      // The imported list below is rendered on the server; re-read it.
      if (write) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(null);
    }
  }

  const writable = result?.rows.filter((row) => WRITES.has(row.outcome) || (row.outcome === "excluded" && keep[row.cuce])).length ?? 0;

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">粘贴导入</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        在 SICOES「Contrataciones → Convocatorias」里搜索（Modalidad 选 Licitación Pública，Estado 选 Vigente，Monto 从 7000000 起），点项目的「Ver Ficha」，全选整页复制后粘贴到下面。可以连续贴多个项目。同一个 CUCE 再贴一次会更新那一条，不会重复。筛选规则和其他国家的导入相同（包括 100 万美元门槛，玻利维亚诺按平台汇率折算）；页面上的人员姓名和银行账户不会保存。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
          setKeep({});
        }}
        rows={10}
        placeholder={"1. IDENTIFICACIÓN DE LA ENTIDAD\n…\n2. IDENTIFICACIÓN DE LA CONVOCATORIA\nCUCE\n:\n26-…\n…\nPROGRAMACIÓN DEL CRONOGRAMA DE ACTIVIDADES\n…"}
        className="mt-3 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
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
        <div className="mt-4 border-t border-[#eef1f2] pt-3 text-sm text-[#52636e]">
          <p>
            识别到 {result.rows.length} 个项目，其中 {writable} 个会写入。
            {result.written !== undefined && <span className="font-semibold text-emerald-700"> 已写入 {result.written} 条。</span>}
            {result.failed && result.failed.length > 0 && <span className="font-semibold text-red-700"> {result.failed.length} 条失败：{result.failed.map((f) => f.error).join("；")}</span>}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {result.rows.map((row) => (
              <li key={row.cuce} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#071826]">{row.cuce}</span>
                  {row.international && <span className="rounded-full bg-[#e8f0fb] px-2 py-0.5 text-[11px] font-black text-[#1f4f8a]">国际公开招标</span>}
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <OutcomeTag row={row} />
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
                <p className="mt-1 text-xs text-[#64717c]">
                  {row.buyer} · {row.procedureType} · {SCOPE_LABEL[row.scopeType] ?? row.scopeType} · {money(row)}
                </p>
                <p className="mt-1 text-xs text-[#64717c]">
                  发布 {boliviaTime(row.publicationDate)} · 交标截止 {boliviaTime(row.submissionDeadline)}（玻利维亚时间） · 关键日期 {row.keyDates} 个
                </p>
                <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
                {(row.outcome === "excluded" || row.outcome === "manual_keep") && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#233846]">
                    手动保留
                    <select
                      value={keep[row.cuce] ?? ""}
                      onChange={(event) => {
                        const tier = event.target.value as BoliviaKeepTier | "";
                        setKeep((current) => {
                          const next = { ...current };
                          if (tier) next[row.cuce] = tier;
                          else delete next[row.cuce];
                          return next;
                        });
                      }}
                      className="h-8 rounded-lg border border-[#d8e0e3] bg-white px-2 text-xs text-[#071826] outline-none focus:border-[#ffb21c]"
                    >
                      <option value="">不保留（按规则排除）</option>
                      {BOLIVIA_KEEP_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          保留为「{TIER_LABEL[tier]}」
                        </option>
                      ))}
                    </select>
                    <span className="font-normal text-[#7a878f]">选了就会写入，并锁定为你选的档位（和在项目管理里手动改档位一样），以后重新导入不会被覆盖。</span>
                  </label>
                )}
                {row.existingSlug && <p className="mt-1 text-xs font-semibold text-[#8a5a00]">平台上已有这个 CUCE（{row.existingSlug}），写入时更新那一条，不新增。</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
