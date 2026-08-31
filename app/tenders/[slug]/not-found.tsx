"use client";

import Link from "next/link";
import { localize, uiText, useLocale } from "@/lib/i18n";

export default function TenderNotFound() {
  const { locale } = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-6 py-16">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.notFoundTitle, locale)}
      </h1>
      <p className="text-sm text-zinc-500">{localize(uiText.notFoundBody, locale)}</p>
      <Link
        href="/tenders"
        className="text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
      >
        {localize(uiText.backToTenders, locale)}
      </Link>
    </div>
  );
}
