"use client";

import type { TenderKeyDate } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { KEY_DATE_TYPE_LABELS, KEY_DATE_TYPE_DESCRIPTIONS } from "@/lib/tender-labels";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";

export function KeyDatesTimeline({ dates }: { dates: TenderKeyDate[] }) {
  const { locale } = useLocale();
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading
        title={localize(uiText.criticalDates, locale)}
        description="按时间顺序查看澄清、提交与开标等关键节点"
        count={sorted.length}
      />
      {sorted.length === 0 ? (
        <p className="text-sm text-[#64717c]">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <ol className="grid overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((keyDate, index) => (
            <li
              key={keyDate.id}
              className="flex min-w-0 items-start gap-3 border-[#e5e9eb] px-4 py-3.5 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-[10px] font-black text-[#ffb21c]">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-black text-[#071826]">
                  {localize(KEY_DATE_TYPE_LABELS[keyDate.type], locale)}
                  {keyDate.mandatory && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      {localize(uiText.mandatory, locale)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-[#64717c]">
                  {localize(keyDate.notes ?? KEY_DATE_TYPE_DESCRIPTIONS[keyDate.type], locale)}
                </p>
              </div>
              <span className="ml-auto whitespace-nowrap text-sm font-black text-[#b86e00]">
                {formatDate(keyDate.date, locale)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
