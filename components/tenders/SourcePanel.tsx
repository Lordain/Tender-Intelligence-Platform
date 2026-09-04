"use client";

import { useState } from "react";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";

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
    <section className="rounded-2xl bg-[#061b2b] p-6 text-white">
      <h2 className="text-xl font-black">
        {localize(uiText.source, locale)}
      </h2>
      <p className="mt-2 text-sm text-white/65">{tender.sourceName}</p>
      <a
        href={tender.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-xl bg-[#ffb21c] px-4 py-2 text-sm font-bold text-[#071826] hover:bg-[#ffc247]"
      >
        {localize(uiText.viewSourceDocument, locale)}
      </a>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-white/80">{tender.tenderNumber}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {copied ? localize(uiText.copiedToClipboard, locale) : localize(uiText.copyProcedureNumber, locale)}
        </button>
      </div>
    </section>
  );
}
