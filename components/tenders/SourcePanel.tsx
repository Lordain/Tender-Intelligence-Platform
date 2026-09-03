"use client";

import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function SourcePanel({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

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
    </section>
  );
}
