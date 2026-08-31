"use client";

import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function SourcePanel({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

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
    </section>
  );
}
