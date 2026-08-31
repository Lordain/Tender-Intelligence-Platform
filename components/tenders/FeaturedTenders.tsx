"use client";

import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderCard } from "@/components/tenders/TenderCard";

export function FeaturedTenders({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.featuredTenders, locale)}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender) => (
          <TenderCard key={tender.id} tender={tender} />
        ))}
      </div>
    </section>
  );
}
