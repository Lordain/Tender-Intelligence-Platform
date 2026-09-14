"use client";

import { useState } from "react";

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
};

type WriteResult = {
  written: number;
  timelineRows: number;
  deadlineSet?: string;
  deadlineUnchanged?: string;
  problems: string[];
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

export function CronogramaPasteForm({ tenderSlug }: { tenderSlug: string }) {
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(isPreview: boolean) {
    setBusy(true);
    setError(null);
    if (isPreview) setResult(null);
    try {
      const response = await fetch(`/api/admin/tenders/${tenderSlug}/cronograma`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pasted, preview: isPreview }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "请求失败");
      if (isPreview) setPreview(data as Preview);
      else {
        setResult(data as WriteResult);
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#dbe2e5] bg-[#fdfcf8] p-5">
      <div>
        <p className="text-sm font-black text-[#071826]">从 SEACE ficha 粘贴日程</p>
        <p className="mt-1 text-xs text-[#52636e]">
          秘鲁的交标截止日只在 ficha de selección 页面上，数据源不提供，标书里也没有。
          打开该项目的 ficha，选中右侧 <span className="font-bold">Cronograma</span> 整张表复制，粘贴到下面。
          不调用模型，不访问 SEACE，解析是确定性的。
        </p>
      </div>

      <textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        rows={6}
        placeholder={"Etapa\tFecha Inicio\tFecha Fin\nConvocatoria\t10/09/2026\t10/09/2026\n…"}
        className="w-full rounded-xl border border-[#d8e0e3] bg-white p-3 font-mono text-xs text-[#071826] outline-none focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10"
      />

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
          disabled={busy || !preview || preview.rows.length === 0}
          onClick={() => send(false)}
          className="rounded-xl bg-[#ffb21c] px-4 py-2 text-sm font-black text-[#071826] disabled:opacity-40"
          title={preview ? undefined : "先点左边的「先预览」，确认解析结果后这里才会亮"}
        >
          {!preview
            ? "第二步：写入（预览后可点）"
            : preview.rows.length === 0
              ? "没有可写入的日期"
              : `写入这 ${preview.rows.length} 条`}
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
                {preview.rows.map((row) => (
                  <tr key={`${row.type}-${row.date}`} className="border-b border-[#f0f2f3]">
                    <td className="py-1.5 pr-3 font-black text-[#071826]">{TYPE_LABELS[row.type] ?? row.type}</td>
                    <td className="py-1.5 pr-3 font-mono">{row.date}</td>
                    <td className="py-1.5 text-[#52636e]">{row.label}</td>
                  </tr>
                ))}
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
                ? `交标截止：ficha 是 ${preview.extractedDeadline}，但本项目已有 ${preview.storedDeadline} —— 不会覆盖，如需更改请用上方的「投标截止日期」字段。`
                : `交标截止 ${preview.extractedDeadline} 将写入本项目（原为空）。`}
            </p>
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
          {result.deadlineSet && <p className="mt-1 font-black">交标截止日已设为 {result.deadlineSet}。</p>}
          {result.deadlineUnchanged && <p className="mt-1">本项目已有交标截止日 {result.deadlineUnchanged}，未覆盖。</p>}
          <p className="mt-1">刷新页面查看关键日期时间线。</p>
        </div>
      )}
    </div>
  );
}
