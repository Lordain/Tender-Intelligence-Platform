"use client";

import type { Locale, LocalizedText, TenderRequirement } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-none stroke-current transition-transform group-open:rotate-180">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RequirementItem({ item, locale }: { item: TenderRequirement; locale: Locale }) {
  return (
    <li className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-[#071826]">{localize(item.title, locale)}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            item.mandatory ? "bg-[#fff0eb] text-[#b42318]" : "bg-[#edf2f3] text-[#52636e]"
          }`}
        >
          {localize(item.mandatory ? uiText.mandatory : uiText.optional, locale)}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-[#52636e]">{localize(item.description, locale)}</p>
      {item.sourceReference && (
        <p className="mt-2 text-xs text-[#849098]">
          {localize(uiText.source, locale)}: {item.sourceReference}
        </p>
      )}
    </li>
  );
}

export function RequirementSection({
  title,
  items,
}: {
  title: LocalizedText;
  items: TenderRequirement[];
}) {
  const { locale } = useLocale();
  const mandatoryItems = items.filter((item) => item.mandatory);
  const optionalItems = items.filter((item) => !item.mandatory);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-black text-[#071826]">{localize(title, locale)}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-[#64717c]">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <>
          {mandatoryItems.length > 0 && (
            <ul className="flex flex-col gap-3">
              {mandatoryItems.map((item) => (
                <RequirementItem key={item.id} item={item} locale={locale} />
              ))}
            </ul>
          )}
          {optionalItems.length > 0 && (
            <details className="group" open={mandatoryItems.length === 0}>
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-[#52636e] hover:text-[#071826] [&::-webkit-details-marker]:hidden">
                <ChevronIcon />
                其他 {optionalItems.length} 项非强制要求
              </summary>
              <ul className="mt-3 flex flex-col gap-3">
                {optionalItems.map((item) => (
                  <RequirementItem key={item.id} item={item} locale={locale} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
