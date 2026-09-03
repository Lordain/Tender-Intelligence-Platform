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
    <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.source, locale)}
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{tender.sourceName}</p>
      <a
        href={tender.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
      >
        {localize(uiText.viewSourceDocument, locale)}
      </a>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">
          {tender.tenderNumber}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copied ? localize(uiText.copiedToClipboard, locale) : localize(uiText.copyProcedureNumber, locale)}
        </button>
      </div>
    </section>
  );
}
