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
      <h2 className="text-xl font-black text-[#071826]">
        {localize(title, locale)}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-[#64717c]">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-[#071826]">
                  {localize(item.title, locale)}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.mandatory
                      ? "bg-[#fff0eb] text-[#b42318]"
                      : "bg-[#edf2f3] text-[#52636e]"
                  }`}
                >
                  {localize(item.mandatory ? uiText.mandatory : uiText.optional, locale)}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-[#52636e]">
                {localize(item.description, locale)}
              </p>
              {item.sourceReference && (
                <p className="mt-2 text-xs text-[#849098]">
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
