"use client";

import type { Locale, LocalizedText, TenderRequirement } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";

const COLLAPSE_AFTER = 6;

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-none stroke-current transition-transform group-open:rotate-180">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RequirementItem({ item, locale }: { item: TenderRequirement; locale: Locale }) {
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-black leading-5 text-[#071826] sm:text-base">{localize(item.title, locale)}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            item.mandatory ? "bg-[#fff0eb] text-[#b42318]" : "bg-[#edf2f3] text-[#52636e]"
          }`}
        >
          {localize(item.mandatory ? uiText.mandatory : uiText.optional, locale)}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-[#52636e]">{localize(item.description, locale)}</p>
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
  description,
  items,
}: {
  title: LocalizedText;
  description: string;
  items: TenderRequirement[];
}) {
  const { locale } = useLocale();
  const mandatoryItems = items.filter((item) => item.mandatory);
  const optionalItems = items.filter((item) => !item.mandatory);
  const visibleMandatoryItems = mandatoryItems.slice(0, COLLAPSE_AFTER);
  const hiddenMandatoryItems = mandatoryItems.slice(COLLAPSE_AFTER);

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading title={localize(title, locale)} description={description} count={items.length} />
      {items.length === 0 ? (
        <p className="text-sm text-[#64717c]">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <>
          {mandatoryItems.length > 0 && (
            <ul className="divide-y divide-[#e5e9eb] overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
              {visibleMandatoryItems.map((item) => (
                <RequirementItem key={item.id} item={item} locale={locale} />
              ))}
            </ul>
          )}
          {hiddenMandatoryItems.length > 0 && (
            <details className="group rounded-xl border border-[#dbe2e5] bg-[#fffdf9]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-[#425461] hover:bg-[#f2f4f3] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2"><ChevronIcon />展开其余 {hiddenMandatoryItems.length} 项强制要求</span>
                <span className="text-xs font-semibold text-[#87939a]">完整查看</span>
              </summary>
              <ul className="divide-y divide-[#e5e9eb] border-t border-[#e5e9eb]">
                {hiddenMandatoryItems.map((item) => <RequirementItem key={item.id} item={item} locale={locale} />)}
              </ul>
            </details>
          )}
          {optionalItems.length > 0 && (
            <details className="group" open={mandatoryItems.length === 0}>
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-[#52636e] hover:text-[#071826] [&::-webkit-details-marker]:hidden">
                <ChevronIcon />
                其他 {optionalItems.length} 项非强制要求
              </summary>
              <ul className="mt-3 divide-y divide-[#e5e9eb] overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
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
