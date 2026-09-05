"use client";

import { useState } from "react";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";

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
        <p className="mt-3 text-xs leading-5 text-white/60">本平台仅提供官方入口与信息整理，不代替正式投标。若链接进入官方检索页，请复制以上招标编号查询，并以官方文件和要求为准。</p>
      </div>
    </section>
  );
}
