"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Paste a SEACE ficha's Cronograma table; get this tender's key dates.
 *
 * Exists because Peru's bid deadline is published in exactly one place —
 * the ficha HTML page — whose URL is keyed by a UUID that appears nowhere
 * in the OCDS record (see lib/ingestion/seace-cronograma.ts). There is no
 * way to reach that page from the data, so an admin opens it themselves;
 * this turns the table they are already looking at into stored dates
 * without a single model call or request to SEACE.
 *
 * Preview first, always. The bid deadline is the one field on this platform
 * a customer acts on — a wrong one either hides a live tender or holds an
 * expired one open — so nothing is written until the admin has seen which
 * rows were read, which were skipped and why, and what the self-consistency
 * checker made of the result.
 */
type Preview = {
  rows: { label: string; date: string; type: string; raw: string }[];
  ignored: { label: string; reason: string }[];
  unparsed: string[];
  problems: string[];
  storedDeadline: string | null;
  extractedDeadline?: string;
  storedAwardDate: string | null;
  extractedAwardDate?: string;
  /** Ficha rows an existing entry already states — not written again. */
  duplicates: { label: string; date: string; type: string; existingSource: string }[];
  /** Same stage, different day. Both rows end up stored; a person settles it. */
  conflicts: { label: string; type: string; fichaDate: string; storedDate: string; existingSource: string }[];
  /** How many rows would actually be inserted. */
  willInsert: number;
};

type WriteResult = {
  written: number;
  timelineRows: number;
  deadlineSet?: string;
  deadlineUnchanged?: string;
  awardDateSet?: string;
  awardDateUnchanged?: string;
  fichaUrlSet?: string;
  sourceUrlSet?: string;
  fichaNotUsedAsPublicLink?: boolean;
  problems: string[];
  duplicates: { label: string; date: string; type: string; existingSource: string }[];
  conflicts: { label: string; type: string; fichaDate: string; storedDate: string; existingSource: string }[];
};

const TYPE_LABELS: Record<string, string> = {
  questions_deadline: "提问截止",
  clarification: "澄清/答疑",
  submission: "交标截止",
  opening: "开标",
  award: "授标",
  contract_signing: "签约",
  site_visit: "现场踏勘",
};

export function CronogramaPasteForm({
  tenderSlug,
  country,
  initialFichaUrl,
}: {
  tenderSlug: string;
  country: string;
  /** Whatever a previous paste stored (migration 0048), so it is visible and correctable rather than silently overwritten. */
  initialFichaUrl?: string;
}) {
  const [pasted, setPasted] = useState("");
  const [fichaUrl, setFichaUrl] = useState(initialFichaUrl ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function send(isPreview: boolean) {
    setBusy(true);
    setError(null);
    if (isPreview) setResult(null);
    try {
      const response = await fetch(`/api/admin/tenders/${tenderSlug}/cronograma`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pasted, preview: isPreview, fichaUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "请求失败");
      if (isPreview) setPreview(data as Preview);
      else {
        setResult(data as WriteResult);
        setPreview(null);
        // Pull the written rows back down so the key-dates list above updates
        // in place. The result panel is client state and survives this.
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // The two sources publish their schedule in completely different shapes, so
  // the instructions have to name the right page — the parser detects the
  // format either way, but an admin needs to know what to go and copy.
  const copy =
    country === "Mexico"
      ? {
          title: "从 Proyectos Estratégicos 粘贴日程",
          body: (
            <>
              打开该项目在 proyectosestrategicosmx.hacienda.gob.mx 的「procedimiento」页，选中{" "}
              <span className="font-bold">CRONOGRAMA DE EVENTOS</span> 整块复制，粘贴到下面。
              其中「presentación y apertura de proposiciones」是提交与开标的同一场会，会写成交标截止和开标两条。
              不调用模型，不访问该网站，解析是确定性的。
            </>
          ),
        }
      : {
          title: "从 SEACE ficha 粘贴日程",
          body: (
            <>
              秘鲁的交标截止日只在 ficha de selección 页面上，数据源不提供，标书里也没有。
              打开该项目的 ficha，选中右侧 <span className="font-bold">Cronograma</span> 整张表复制，粘贴到下面。
              不调用模型，不访问 SEACE，解析是确定性的。
            </>
          ),
        };

  // A paste whose every row the tender already has is still worth writing when
  // the deadline column is empty — that is the field the public page shows.
  const deadlineIsNew = Boolean(preview?.extractedDeadline && !preview?.storedDeadline);
  const awardDateIsNew = Boolean(preview?.extractedAwardDate && !preview?.storedAwardDate);
  const canWrite = Boolean(preview && (preview.willInsert > 0 || deadlineIsNew || awardDateIsNew));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#dbe2e5] bg-[#fdfcf8] p-5">
      <div>
        <p className="text-sm font-black text-[#071826]">{copy.title}</p>
        <p className="mt-1 text-xs text-[#52636e]">{copy.body}</p>
      </div>

      <textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        rows={6}
        placeholder={
          country === "Mexico"
            ? "Fecha y hora de presentación y apertura de proposiciones:\n08/10/2026 11:00\n…"
            : "Etapa\tFecha Inicio\tFecha Fin\nConvocatoria\t10/09/2026\t10/09/2026\n…"
        }
        className="w-full rounded-xl border border-[#d8e0e3] bg-white p-3 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10"
      />

      {/* The page this table was copied from. A Peru ficha is addressed by a
          UUID that exists nowhere in the feed, so `source_url` can only ever
          be SEACE's generic search page — and when 13 pasted deadlines were
          lost to an import (2026-09-15), every one had to be found again by
          typing its procedure number into that search. The admin pasting is
          already on the right page with its URL in the address bar. */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-[#52636e]">
          {country === "Mexico" ? "该项目页面链接（选填）" : "ficha 链接（选填）"}
          <span className="ml-1 font-normal text-[#8a97a0]">
            ——{country === "Mexico" ? "复制浏览器地址栏里这个项目的网址" : "复制浏览器地址栏里 ficha de selección 的网址"}。
            {country === "Mexico" ? (
              <>
                填了会<span className="font-bold text-[#b86e00]">同时更新最下方的「官方标书链接」</span>，也就是前台那个官方入口按钮——
                读者点进去就是这个项目本身，而不是平台首页或搜索页。
              </>
            ) : (
              <>
                只存下来供自己复核，<span className="font-bold text-[#b86e00]">不会</span>改前台的官方入口——
                SEACE 的 ficha 链接只在你当前这次浏览会话里有效，换个人、换个时间点开就是一张空表。
              </>
            )}
          </span>
        </span>
        <input
          type="url"
          value={fichaUrl}
          onChange={(event) => setFichaUrl(event.target.value)}
          placeholder={
            country === "Mexico"
              ? "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/…"
              : "https://prod2.seace.gob.pe/seacebus-uiwd-pub/fichaSeleccion/fichaSeleccion.xhtml?id=…"
          }
          className="w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 text-xs text-[#071826] outline-none focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10"
        />
        {initialFichaUrl && (
          <a
            href={initialFichaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-xs font-bold text-[#b86e00] underline"
          >
            打开已保存的链接 ↗
          </a>
        )}
      </label>

      {/* Two-step on purpose, and the labels have to say so. The write button
          first read "写入这 0 条" before a preview had ever run, which a user
          reasonably read as "your table parsed to nothing" rather than "not
          your turn yet" — they asked why it could not be clicked while the
          paste was in fact parsing perfectly. A disabled control must say
          what would enable it. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !pasted.trim()}
          onClick={() => send(true)}
          className={`rounded-xl px-4 py-2 text-sm font-black disabled:opacity-50 ${
            preview ? "border border-[#d8e0e3] bg-white text-[#071826]" : "bg-[#071826] text-white"
          }`}
        >
          {busy ? "处理中…" : preview ? "重新预览" : "第一步：先预览"}
        </button>
        <button
          type="button"
          disabled={busy || !canWrite}
          onClick={() => send(false)}
          className="rounded-xl bg-[#ffb21c] px-4 py-2 text-sm font-black text-[#071826] disabled:opacity-40"
          title={preview ? undefined : "先点左边的「先预览」，确认解析结果后这里才会亮"}
        >
          {!preview
            ? "第二步：写入（预览后可点）"
            : preview.willInsert > 0
              ? `写入这 ${preview.willInsert} 条`
              : deadlineIsNew
                ? "只写入交标截止日/中标日期"
                : "无需写入（都已存在）"}
        </button>
        {!preview && !busy && (
          <span className="text-xs text-[#52636e]">先预览，看清解析结果后写入按钮才会亮。</span>
        )}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}

      {preview && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#e5e9eb] bg-white p-4 text-xs">
          {preview.rows.length > 0 ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#e5e9eb] text-[#52636e]">
                  <th className="py-1.5 pr-3 font-black">类型</th>
                  <th className="py-1.5 pr-3 font-black">日期</th>
                  <th className="py-1.5 font-black">ficha 原文</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const duplicate = preview.duplicates.find((item) => item.type === row.type && item.date === row.date);
                  return (
                    <tr key={`${row.type}-${row.date}`} className="border-b border-[#f0f2f3]">
                      <td className="py-1.5 pr-3 font-black text-[#071826]">{TYPE_LABELS[row.type] ?? row.type}</td>
                      <td className="py-1.5 pr-3 font-mono">{row.date}</td>
                      <td className="py-1.5 text-[#52636e]">
                        {row.label}
                        {duplicate && (
                          <span className="ml-2 text-[#52636e]">
                            —— 已有同日记录（{duplicate.existingSource}），不重复写入
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-red-700">没有解析出任何可写入的日期。</p>
          )}

          {/* The deadline gets its own line: it is the only row here that
              changes what the public site says about whether a tender is
              still open. */}
          {preview.extractedDeadline && (
            <p className={preview.storedDeadline ? "text-amber-700" : "font-black text-emerald-700"}>
              {preview.storedDeadline
                ? `交标截止：日程是 ${preview.extractedDeadline}，但本项目已有 ${preview.storedDeadline} —— 不会覆盖，如需更改请用上方的「投标截止日期」字段。`
                : `交标截止 ${preview.extractedDeadline} 将写入本项目（原为空）。`}
            </p>
          )}

          {/* The award date gets the same treatment, and the same caveat: it
              fills 中标日期, which is a RESULT field. The date here is the
              planned otorgamiento de la buena pro, so the note says so. */}
          {preview.extractedAwardDate && (
            <p className={preview.storedAwardDate ? "text-amber-700" : "font-black text-emerald-700"}>
              {preview.storedAwardDate
                ? `中标日期：日程是 ${preview.extractedAwardDate}，但本项目已有 ${preview.storedAwardDate} —— 不会覆盖。`
                : `中标日期 ${preview.extractedAwardDate} 将写入本项目（原为空，这是日程上的计划授标日，不代表已经定标）。`}
            </p>
          )}

          {/* The one case a person has to settle: the ficha and something already
              stored disagree about the same stage. Both rows are kept — nothing
              deletes a record nobody reviewed — so this has to be loud. */}
          {preview.conflicts.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-900">
              <p className="font-black">与已有日期不一致，两条都会保留，请人工核对后删掉错的：</p>
              <ul className="mt-1 list-disc pl-4">
                {preview.conflicts.map((item) => (
                  <li key={`${item.type}-${item.fichaDate}`}>
                    {TYPE_LABELS[item.type] ?? item.type}：ficha 是 {item.fichaDate}，库里已有 {item.storedDate}（
                    {item.existingSource}）
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.problems.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
              <p className="font-black">日程自洽性有疑点，请核对是否粘贴了正确的行：</p>
              <ul className="mt-1 list-disc pl-4">
                {preview.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.ignored.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[#52636e]">{preview.ignored.length} 行已跳过（点开看原因）</summary>
              <ul className="mt-1 list-disc pl-4 text-[#52636e]">
                {preview.ignored.map((item) => (
                  <li key={item.label}>
                    {item.label} — {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.unparsed.length > 0 && (
            <div className="text-red-700">
              <p className="font-black">{preview.unparsed.length} 行没看懂（不会写入）：</p>
              <ul className="mt-1 list-disc pl-4 font-mono">
                {preview.unparsed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <p className="font-black">已写入 {result.timelineRows} 条时间线日期。</p>
          {result.duplicates.length > 0 && (
            <p className="mt-1">
              {result.duplicates.length} 条已有同日记录，未重复写入（{result.duplicates
                .map((item) => `${TYPE_LABELS[item.type] ?? item.type} ${item.date}`)
                .join("、")}）。
            </p>
          )}
          {result.conflicts.length > 0 && (
            <p className="mt-1 font-black text-red-800">
              {result.conflicts.length} 条与已有日期不一致，两条都在页面上，请核对后删掉错的。
            </p>
          )}
          {result.deadlineSet && <p className="mt-1 font-black">交标截止日已设为 {result.deadlineSet}。</p>}
          {result.fichaUrlSet && <p className="mt-1">已保存该项目的页面链接，以后复核可直接打开。</p>}
          {result.sourceUrlSet && <p className="mt-1 font-black">官方标书链接已更新为该链接，前台的官方入口现在直达本项目。</p>}
          {result.fichaNotUsedAsPublicLink && (
            <p className="mt-1 text-[#b86e00]">
              前台的官方入口<span className="font-black">没有</span>改成这个链接——SEACE 的 ficha 页面认浏览器会话，
              你刚从检索页点进去所以能打开，读者直接点会是一张空表。官方入口继续指向 SEACE 检索页。
            </p>
          )}
          {result.deadlineUnchanged && <p className="mt-1">本项目已有交标截止日 {result.deadlineUnchanged}，未覆盖。</p>}
          {result.awardDateSet && <p className="mt-1 font-black">中标日期已设为 {result.awardDateSet}（计划授标日）。</p>}
          {result.awardDateUnchanged && <p className="mt-1">本项目已有中标日期 {result.awardDateUnchanged}，未覆盖。</p>}
          <p className="mt-1">上方的关键日期列表已同步更新。</p>
        </div>
      )}
    </div>
  );
}
