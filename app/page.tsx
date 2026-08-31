"use client";

import Link from "next/link";
import { getAllTenders } from "@/lib/tenders";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { TenderCard } from "@/components/tenders/TenderCard";

const FEATURED_COUNT = 3;

export default function Home() {
  const { locale } = useLocale();
  const featured = getAllTenders()
    .slice()
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))
    .slice(0, FEATURED_COUNT);

  return (
    <div className="flex flex-col">
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

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.featuredTenders, locale)}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((tender) => (
            <TenderCard key={tender.id} tender={tender} />
          ))}
        </div>
      </section>
    </div>
  );
}
