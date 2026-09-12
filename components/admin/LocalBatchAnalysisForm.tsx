"use client";

import { useState } from "react";

type Result = {
  filesFound: number;
  tendersMatched: number;
  skipped: string[];
  results: {
    tenderSlug: string;
    fileName: string;
    documentType: string;
    model: string;
    oneLineSummary: string;
    qualifications: number;
    experienceRequirements: number;
    requiredDocuments: number;
    risks: number;
    status: string;
    warnings?: string[];
  }[];
  failed: { tenderSlug: string; error: string }[];
};

const inputClass =
  "w-full rounded-xl border border-[#d8e0e3] bg-white px-3 py-2.5 text-sm text-[#071826] outline-none transition-shadow focus:border-[#ffb21c] focus:ring-4 focus:ring-[#ffb21c]/10";

export function LocalBatchAnalysisForm() {
  const [folderPath, setFolderPath] = useState("");
  const [write, setWrite] = useState(true);
  const [force, setForce] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/local-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath, write, force }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "分析失败");
      else setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_22px_60px_-52px_rgba(6,27,43,.55)] sm:p-6">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-black text-[#52636e]">文件夹完整路径（本机）</span>
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="D:\tenders\2026-09"
            className={inputClass}
            spellCheck={false}
          />
          <span className="text-xs text-[#8a959c]">
            文件留在本机，浏览器不上传任何文件。支持 .pdf / .docx / .doc，子文件夹不会被扫描。
          </span>
        </label>

        <div className="mt-5 flex flex-col gap-2 border-t border-[#e5e9eb] pt-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} className="accent-[#ffb21c]" />
            写入 Supabase（不勾选则只分析预览，不改数据库）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-[#ffb21c]" />
            重新分析已处理过的文件（默认按内容哈希跳过，避免重复付费）
          </label>
        </div>

        <button
          type="submit"
          disabled={running || !folderPath.trim()}
          className="mt-5 rounded-xl bg-[#ffb21c] px-5 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#f0a50f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "分析中…（大文件可能要几分钟，请勿关闭页面）" : "开始分析并写入"}
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-white p-5 text-sm sm:p-6">
          <p className="font-bold text-[#071826]">
            找到 {result.filesFound} 个文件，匹配到 {result.tendersMatched} 个项目，
            {result.failed.length > 0 && <span className="text-red-700">{result.failed.length} 个项目失败，</span>}
            {result.skipped.length} 个文件未匹配
          </p>

          {result.results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e5e9eb] text-[#52636e]">
                    <th className="py-2 pr-3 font-black">项目</th>
                    <th className="py-2 pr-3 font-black">文件</th>
                    <th className="py-2 pr-3 font-black">一句话总结</th>
                    <th className="py-2 pr-3 font-black">模型</th>
                    <th className="py-2 pr-3 font-black">资质/业绩/文件/风险</th>
                    <th className="py-2 font-black">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((row) => (
                    <tr key={row.tenderSlug} className="border-b border-[#f0f2f3] align-top">
                      <td className="py-2 pr-3 font-mono text-[11px]">{row.tenderSlug}</td>
                      <td className="py-2 pr-3">{row.fileName}</td>
                      {/* The single most useful column for judging whether an
                          analysis is any good — a wrong or empty summary shows
                          a bad extraction faster than the four counts do. */}
                      <td className="py-2 pr-3 max-w-[22rem] text-[#071826]">{row.oneLineSummary || <span className="text-[#8a959c]">（空）</span>}</td>
                      <td className="py-2 pr-3 text-[#52636e]">{row.model}</td>
                      <td className="py-2 pr-3">
                        {row.qualifications}/{row.experienceRequirements}/{row.requiredDocuments}/{row.risks}
                      </td>
                      <td className="py-2">
                        {row.status === "written" ? "已写入" : row.status === "dry-run" ? "仅预览" : row.status}
                        {row.warnings?.length ? <span className="block text-[11px] text-amber-700">{row.warnings.join("；")}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.failed.length > 0 && (
            <div>
              <p className="text-xs font-black text-red-700">分析失败</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
                {result.failed.map((f) => (
                  <li key={f.tenderSlug}>
                    {f.tenderSlug} — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div>
              <p className="text-xs font-black text-[#52636e]">未匹配到项目（文件未分析，不计费）</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-[#8a959c]">
                {result.skipped.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
