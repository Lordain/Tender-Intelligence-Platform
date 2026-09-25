"use client";

import { useEffect, useState } from "react";
import type { SecopDocumentListResponse } from "@/app/api/admin/secop-documents/route";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: SecopDocumentListResponse };

/**
 * The official files of a Colombian tender with no public SECOP page, opened
 * under its row in 待补文件 in place of the 官方入口 link (user, 2026-09-25:
 * 如果没有官方入口才做). Each link downloads straight from SECOP in the
 * admin's own browser; the file then goes up through the row's 选择上传.
 */
export function SecopDocumentsPanel({ processId }: { processId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/secop-documents?process=${encodeURIComponent(processId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) setState({ kind: "error", message: body.error ?? `请求失败（${response.status}）` });
        else setState({ kind: "ready", data: body as SecopDocumentListResponse });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [processId]);

  if (state.kind === "loading") {
    return <p className="text-xs text-[#75838c]">正在读取哥伦比亚开放数据里的文件清单…</p>;
  }
  if (state.kind === "error") {
    return <p className="text-xs font-bold text-[#a1321f]">{state.message}</p>;
  }

  const { officialUrl, total, documents, fullListUrl } = state.data;
  return (
    <div className="flex flex-col gap-3">
      {officialUrl ? (
        <p className="text-xs text-[#1c6b2c]">
          SECOP 已经发布了正式项目页（明天的自动刷新会更新这一行的官方入口）：
          <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-black underline underline-offset-2">打开官方入口 ↗</a>
        </p>
      ) : (
        <p className="text-xs text-[#5d6d77]">这个项目在 SECOP 还是草稿状态，没有公开项目页。下面是官方开放数据里已公开的文件，点击即在浏览器中下载，再用本行的「选择上传」传上来。</p>
      )}
      {documents.length === 0 ? (
        <p className="text-xs font-bold text-[#8a5a00]">开放数据里暂时还没有这个项目的文件。</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {documents.map((doc) => (
            <li key={doc.id} className="min-w-0">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                title={doc.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#dbe2e5] bg-white px-3 py-2 text-[11px] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
              >
                <span className="truncate font-bold text-[#0a2b40]">{doc.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[#75838c]">{[doc.sizeKb ? `${doc.sizeKb} KB` : "", doc.uploadedAt ?? ""].filter(Boolean).join(" · ")}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {total > documents.length && fullListUrl && (
        <p className="text-[11px] text-[#75838c]">
          共 {total} 个文件，这里列出前 {documents.length} 个。
          <a href={fullListUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-black text-[#0a2b40] underline underline-offset-2">查看完整清单 ↗</a>
        </p>
      )}
    </div>
  );
}
