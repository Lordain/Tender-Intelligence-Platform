"use client";

import { getAllTenders } from "@/lib/tenders";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderExplorer } from "@/components/tenders/TenderExplorer";

export default function TendersPage() {
  const { locale } = useLocale();
  const tenders = getAllTenders();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.navTenders, locale)}
      </h1>
      <TenderExplorer tenders={tenders} />
    </div>
  );
}
