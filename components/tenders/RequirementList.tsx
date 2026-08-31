"use client";

import type { LocalizedText, TenderRequirement } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";

export function RequirementSection({
  title,
  items,
}: {
  title: LocalizedText;
  items: TenderRequirement[];
}) {
  const { locale } = useLocale();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(title, locale)}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                  {localize(item.title, locale)}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.mandatory
                      ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {localize(item.mandatory ? uiText.mandatory : uiText.optional, locale)}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {localize(item.description, locale)}
              </p>
              {item.sourceReference && (
                <p className="mt-2 text-xs text-zinc-400">
                  {localize(uiText.source, locale)}: {item.sourceReference}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
