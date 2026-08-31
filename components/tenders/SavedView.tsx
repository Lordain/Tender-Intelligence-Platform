"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { useSavedSearches, useSavedTenderIds } from "@/lib/saved";
import { TenderCard } from "@/components/tenders/TenderCard";

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 1.5}
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M10 2a5 5 0 0 0-5 5v2.586l-1.707 1.707A1 1 0 0 0 4 13h12a1 1 0 0 0 .707-1.707L15 9.586V7a5 5 0 0 0-5-5Z" />
      <path d="M8 15a2 2 0 0 0 4 0" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function SavedView({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const { savedIds } = useSavedTenderIds();
  const { searches, removeSearch, toggleAlert } = useSavedSearches();

  const savedTenders = tenders.filter((tender) => savedIds.includes(tender.id));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.savedSearches, locale)}
        </h2>
        {searches.length === 0 ? (
          <p className="text-sm text-zinc-500">{localize(uiText.noSavedSearches, locale)}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {searches.map((search) => (
              <li key={search.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link
                  href={search.href}
                  className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {search.name}
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleAlert(search.id)}
                    aria-pressed={search.alertEnabled}
                    title={localize(uiText.notifyMeOfNewMatches, locale)}
                    className={`inline-flex items-center justify-center rounded-full p-1.5 ${
                      search.alertEnabled
                        ? "text-amber-500"
                        : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    <BellIcon active={search.alertEnabled} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSearch(search.id)}
                    className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-50"
                  >
                    {localize(uiText.remove, locale)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.savedTenders, locale)}
        </h2>
        {savedTenders.length === 0 ? (
          <p className="text-sm text-zinc-500">{localize(uiText.noSavedTenders, locale)}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {savedTenders.map((tender) => (
              <TenderCard key={tender.id} tender={tender} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
