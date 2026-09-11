"use client";

import { useState } from "react";

/**
 * One click → a ZIP of the selected tenders' official bid documents, straight
 * from the government source (app/api/admin/documents/download/route.ts).
 *
 * Sits directly above the 批量分析 panel because that is the actual workflow:
 * select rows → download the ZIP → unzip → drag the files into the analysis
 * panel. The route deliberately does not store the files anywhere, so this
 * component owns the whole "get them onto the admin's disk" half.
 *
 * Only some sources carry machine-readable document links (Peru SEACE/OECE
 * today), so the button reports coverage BEFORE it is pressed rather than
 * after: pressing it for rows that have none is a wasted round trip and an
 * error message, which reads as a broken feature.
 */
export const MAX_DOWNLOAD_SELECTION = 10;

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "downloading" }
  | { kind: "done"; total: number; ok: number }
  | { kind: "error"; message: string };

export function BatchDownloadDocumentsButton({ tenders }: { tenders: { slug: string; documentLinkCount?: number }[] }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const withLinks = tenders.filter((tender) => (tender.documentLinkCount ?? 0) > 0);
  const linkCount = withLinks.reduce((sum, tender) => sum + (tender.documentLinkCount ?? 0), 0);
  const disabled = status.kind === "downloading" || withLinks.length === 0 || tenders.length > MAX_DOWNLOAD_SELECTION;

  async function download() {
    setStatus({ kind: "downloading" });
    try {
      const response = await fetch("/api/admin/documents/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: tenders.map((tender) => tender.slug) }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const total = Number(response.headers.get("X-Download-Total") ?? 0);
      const ok = Number(response.headers.get("X-Download-Ok") ?? 0);
      const blob = await response.blob();
      // Revoked on the next tick rather than immediately: Safari cancels an
      // in-flight download if its object URL is revoked in the same frame.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tender-documents-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);

      setStatus({ kind: "done", total, ok });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-[#071826]">批量下载标书</h3>
          <p className="mt-1 text-xs text-[#64717c]">
            {withLinks.length > 0 ? (
              <>
                已选 {tenders.length} 个项目，其中 <span className="font-black text-[#071826]">{withLinks.length}</span> 个带官方标书链接，共{" "}
                <span className="font-black text-[#071826]">{linkCount}</span> 份文件。文件名是{" "}
                <code className="rounded bg-[#edf2f3] px-1 font-mono text-[10px]">项目slug__文件名.pdf</code>
                ，解压后可以直接拖进下面的分析面板，或者把整个文件夹丢给「本地批量分析」——它按这个 slug 自动归属，不用手动一个个对。
                <span className="mt-1 block text-[#8a959c]">
                  秘鲁的服务器较慢、单份标书常有好几 MB，<strong>建议一次选 1～2 个项目</strong>；没下完的重试即可，不会重复计费也不会影响已成功的。
                </span>
              </>
            ) : (
              <>
                已选的项目都没有可自动下载的官方标书链接——需要点「官方正式投标入口」手动下载。
                目前只有秘鲁 SEACE/OECE 的项目自带链接；墨西哥 Compras MX 有反爬限制，无法自动获取。
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={disabled}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#071826] px-5 text-sm font-black text-white transition-colors hover:bg-[#12364d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <DownloadIcon />
          {status.kind === "downloading" ? "正在下载…" : `下载 ${linkCount} 份标书 (.zip)`}
        </button>
      </div>

      {status.kind === "done" &&
        (status.ok === status.total ? (
          <p className="mt-3 rounded-xl bg-[#edf7ee] px-3 py-2 text-xs font-bold text-[#1c6b2c]">
            已下载：{status.ok} / {status.total} 份全部成功。压缩包里的「下载报告.txt」有逐条明细。
          </p>
        ) : (
          // Partial is the common case on this source, not an anomaly worth
          // an error colour: prod1.seace.gob.pe is slow and a single Bases
          // file routinely runs to several MB.
          <p className="mt-3 rounded-xl bg-[#fff8e9] px-3 py-2 text-xs font-bold text-[#7a5200]">
            已下载：{status.ok} / {status.total} 份成功，其余没传完。
            <span className="font-bold">秘鲁服务器慢，一次选 1～2 个项目重试就行</span>
            ——已经成功的不受影响，失败的原因在压缩包里的「下载报告.txt」。
          </p>
        ))}
      {status.kind === "error" && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{status.message}</p>
      )}
    </div>
  );
}
