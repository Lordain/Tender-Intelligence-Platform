"use client";

import Link from "next/link";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function HomeHero() {
  const { locale } = useLocale();

  return (
    <section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-20">
        <span className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {localize(uiText.tagline, locale)}
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
          {localize(uiText.heroTitle, locale)}
        </h1>
        <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          {localize(uiText.heroSubtitle, locale)}
        </p>
        <div>
          <Link
            href="/tenders"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {localize(uiText.browseTenders, locale)}
          </Link>
        </div>
      </div>
    </section>
  );
}
