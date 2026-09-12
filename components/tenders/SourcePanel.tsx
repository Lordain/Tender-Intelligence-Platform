"use client";

import { useState } from "react";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";
import { tenderSearchGuide } from "@/lib/tender-search-guide";

/**
 * Compras MX's "来源" link for a still-open tender (unlike an already-
 * awarded contract) can only ever land on the site's generic search
 * page, not the specific procedure's detail page — that detail page's
 * URL embeds an internal Compras MX database GUID with no derivable
 * relationship to the procedure number, and the only way to look that
 * GUID up is the site's anti-bot-gated detail API, which this platform
 * deliberately doesn't scrape (see lib/ingestion/README.md "The open-
 * tenders-vs-contracts gap"). Copying the real procedure number here so
 * the user can paste it straight into that search page is the real fix
 * available without guessing at undocumented site behavior.
 */
export function SourcePanel({ tender }: { tender: Tender }) {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const searchGuide = tenderSearchGuide(tender);

  async function handleCopy() {
    await navigator.clipboard.writeText(tender.tenderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading title="官方正式投标入口" description="如有兴趣参标，请自行在官方平台核对文件与要求，并按官方流程完成投标" />
      <div className="rounded-2xl bg-[#061b2b] p-5 text-white sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#ffb21c]">官方投标平台</p>
            <p className="mt-1.5 text-sm font-bold text-white/78">{tender.sourceName}</p>
          </div>
          <a
            href={tender.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#ffb21c] px-4 text-sm font-black text-[#071826] hover:bg-[#ffc247]"
          >
            前往官方投标入口 <span aria-hidden="true" className="ml-2">↗</span>
          </a>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-white/80">{tender.tenderNumber}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            {copied ? localize(uiText.copiedToClipboard, locale) : localize(uiText.copyProcedureNumber, locale)}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/60">本站是信息服务，不接收投标文件或代办投标。请前往上述官方渠道完成正式流程；若链接进入官方检索页，请复制招标编号查询，并以官方文件和要求为准。</p>
      </div>

      {/*
        The step list only appears for platforms with no linkable per-tender
        page — see lib/tender-search-guide.ts. On those, "前往官方投标入口"
        lands on a search form, and which of its several fields takes a
        procedure number is not guessable; the Spanish field names are left
        exactly as the pages spell them, since that is what the reader is
        matching against on screen.
      */}
      {searchGuide && (
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-sm font-black text-[#071826]">这个平台要自己检索标书</h3>
            <span className="text-xs font-bold text-[#8a959c]">{searchGuide.platform}</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[#64717c]">
            官方没有可以直接分享的项目页面，需要用上面的招标编号在检索页查一次。按下面 {searchGuide.steps.length} 步走：
          </p>
          <ol className="mt-4 flex flex-col gap-2.5">
            {searchGuide.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-6 text-[#233846]">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-[10px] font-black text-[#ffb21c]">
                  {index + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
          {searchGuide.url && (
            <a
              href={searchGuide.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-9 items-center rounded-xl border border-[#d8e0e3] bg-white px-4 text-xs font-black text-[#071826] transition-colors hover:border-[#b8860b] hover:bg-[#fff4d8]"
            >
              打开 {searchGuide.platform.split(" — ")[0]} 检索页 <span aria-hidden="true" className="ml-1.5">↗</span>
            </a>
          )}
          {searchGuide.note && (
            <p className="mt-4 rounded-xl border border-[#f0d9a8] bg-[#fff8e9] px-3 py-2 text-xs leading-5 text-[#7a5200]">
              {searchGuide.note}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
