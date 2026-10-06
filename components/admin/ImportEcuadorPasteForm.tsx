"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EcuadorImportResponse, EcuadorImportRow } from "@/lib/ingestion/ecuador-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };
const SCOPE_LABEL: Record<string, string> = { works: "工程", equipment: "货物", services: "服务", equipment_services: "货物和服务", consulting: "咨询", unknown: "未注明" };

/** Ecuador wall-clock time (UTC-5), which is what SOCE showed. */
function ecuadorTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function usd(value: number | undefined): string {
  return value === undefined ? "未写金额" : `US$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function OutcomeTag({ row }: { row: EcuadorImportRow }) {
  const className = row.outcome === "write" || row.outcome === "short_window" ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-[#fff3d6] text-[#8a5a00]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-black ${className}`}>{row.outcomeZh}</span>;
}

/**
 * 「SOCE 粘贴导入」 (user, 2026-10-06). The admin picks procedures from SOCE's
 * search results by amount, opens each one's page, selects it, copies and
 * pastes it here; several pages can be pasted one after another. Preview
 * first, then write — the same rules as every other import decide what is
 * written.
 */
export function ImportEcuadorPasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState<"preview" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EcuadorImportResponse | null>(null);

  async function run(write: boolean) {
    if (!text.trim()) {
      setError("请先粘贴 SOCE 项目详情页的内容。");
      return;
    }
    if (write && !confirm("确定要把这些厄瓜多尔项目写入数据库吗？")) return;
    setSubmitting(write ? "write" : "preview");
    setError(null);
    try {
      const res = await fetch("/api/admin/import-ecuador-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, write }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as EcuadorImportResponse);
      // The imported list below is rendered on the server; re-read it.
      if (write) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setSubmitting(null);
    }
  }

  const writable = result?.rows.filter((row) => row.outcome === "write" || row.outcome === "short_window").length ?? 0;

  return (
    <div className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-4">
      <p className="text-sm font-black text-[#071826]">粘贴导入</p>
      <p className="mt-1 text-xs leading-5 text-[#64717c]">
        在 SOCE 搜索结果里按金额挑出想要的项目，打开详情页，从「Descripción del Proceso de Contratación」选到「Fechas de Control del
        Proceso」的最后一行，复制后粘贴到下面；把浏览器地址栏里的官方链接贴在内容上方，项目就会链接到它。可以连续贴多个项目。同一个编号再贴一次会更新那一条，不会重复。筛选规则和其他国家的导入相同（包括 100 万美元门槛）；经办人邮箱不会保存。
      </p>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setResult(null);
        }}
        rows={10}
        placeholder={"https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/informacionProcesoContratacion2.cpe?idSoliCompra=…\nDescripción del Proceso de Contratación\nEntidad:\t…\nObjeto de Proceso:\t…\nCódigo:\t…\n…\nFechas de Control del Proceso\n…"}
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
              <li key={row.code} className="rounded-xl border border-[#e5e9eb] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#071826]">{row.code}</span>
                  <span className="rounded-full bg-[#eef1f2] px-2 py-0.5 text-[11px] font-black text-[#52636e]">{TIER_LABEL[row.tier] ?? row.tier}</span>
                  <OutcomeTag row={row} />
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-[#071826]">{row.title}</p>
                <p className="mt-1 text-xs text-[#64717c]">
                  {row.buyer} · {row.procedureType} · {SCOPE_LABEL[row.scopeType] ?? row.scopeType} · {usd(row.budget)}（不含增值税）
                </p>
                <p className="mt-1 text-xs text-[#64717c]">
                  发布 {ecuadorTime(row.publicationDate)} · 交标截止 {ecuadorTime(row.submissionDeadline)}（厄瓜多尔时间） · 关键日期 {row.keyDates} 个
                </p>
                <p className="mt-1 text-xs text-[#64717c]">{row.reasonZh}</p>
                <p className="mt-1 break-all text-xs text-[#64717c]">
                  {row.officialUrl ? (
                    <>
                      官方链接：
                      <a href={row.officialUrl} target="_blank" rel="noreferrer" className="text-[#b86e00] hover:underline">
                        {row.officialUrl}
                      </a>
                    </>
                  ) : (
                    <span className="text-[#8a5a00]">没有贴官方链接，项目会链接到 SOCE 搜索页。</span>
                  )}
                </p>
                {row.existingSlug && <p className="mt-1 text-xs font-semibold text-[#8a5a00]">平台上已有这个编号（{row.existingSlug}），写入时更新那一条，不新增。</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
