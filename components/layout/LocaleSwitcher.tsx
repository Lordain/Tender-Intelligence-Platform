"use client";

import { LOCALE_LABELS, useLocale } from "@/lib/i18n";
import type { Locale } from "@/types/tender";

const LOCALES: Locale[] = ["en", "es", "zh"];

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1 rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800">
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            locale === option
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          }`}
        >
          {LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
