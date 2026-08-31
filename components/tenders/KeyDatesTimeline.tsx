"use client";

import type { TenderKeyDate } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { KEY_DATE_TYPE_LABELS } from "@/lib/tender-labels";

export function KeyDatesTimeline({ dates }: { dates: TenderKeyDate[] }) {
  const { locale } = useLocale();
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.criticalDates, locale)}
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {sorted.map((keyDate) => (
            <li
              key={keyDate.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {localize(KEY_DATE_TYPE_LABELS[keyDate.type], locale)}
                  {keyDate.mandatory && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      {localize(uiText.mandatory, locale)}
                    </span>
                  )}
                </p>
                {keyDate.notes && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {localize(keyDate.notes, locale)}
                  </p>
                )}
              </div>
              <span className="whitespace-nowrap text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {formatDate(keyDate.date, locale)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
