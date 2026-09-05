"use client";

import type { TenderKeyDate } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { KEY_DATE_TYPE_LABELS, KEY_DATE_TYPE_DESCRIPTIONS } from "@/lib/tender-labels";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";

/**
 * Some real sources report "submission" and "opening" as one and the same
 * event — ComprasMX open-tenders' "FECHA DE PRESENTACIÓN Y APERTURA DE
 * PROPOSICIONES" column literally means "submission-and-opening date" — but
 * that source has no separate opening date to report, so
 * compras-mx-open-tenders-mapper.ts writes the SAME date into both a
 * "submission" and an "opening" tender_key_dates row (real, deliberate —
 * see that mapper's comment). Displayed as two back-to-back timeline
 * entries with an identical date, that reads as a confusing duplicate no
 * matter how clear each entry's own description text is (real user
 * feedback, 2026-09-05, even after the KEY_DATE_TYPE_DESCRIPTIONS
 * clarification pass). Merged at display time only — the two rows still
 * exist separately in the database, since a different source genuinely
 * CAN report them as two distinct real dates and this must keep telling
 * that case apart.
 */
function mergeSameDaySubmissionAndOpening(dates: TenderKeyDate[]): TenderKeyDate[] {
  const submission = dates.find((d) => d.type === "submission");
  const opening = dates.find((d) => d.type === "opening");
  if (!submission || !opening || submission.date !== opening.date) return dates;

  const merged: TenderKeyDate = { ...submission, id: `${submission.id}+${opening.id}` };
  return dates.filter((d) => d !== submission && d !== opening).concat(merged);
}

const MERGED_SUBMISSION_OPENING_LABEL = { en: "Submission & Opening", es: "Presentación y Apertura", zh: "提交与开标（同日）" };
const MERGED_SUBMISSION_OPENING_DESCRIPTION = {
  en: "This source reports submission and opening as the same event — bids are submitted and opened at this single date/time, no separate opening session.",
  es: "Esta fuente reporta la presentación y la apertura como el mismo evento — las ofertas se presentan y se abren en esta misma fecha/hora, sin una sesión de apertura por separado.",
  zh: "该数据来源把提交截止和开标记为同一时刻——投标文件在这个时间点提交后当场拆封，不是分开安排的两个环节。",
};

export function KeyDatesTimeline({ dates }: { dates: TenderKeyDate[] }) {
  const { locale } = useLocale();
  const sorted = [...mergeSameDaySubmissionAndOpening(dates)].sort((a, b) => a.date.localeCompare(b.date));

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
        <ol className="grid gap-3 sm:grid-cols-2">
          {sorted.map((keyDate, index) => {
            const isMerged = keyDate.id.includes("+");
            const isLastOddItem = sorted.length % 2 === 1 && index === sorted.length - 1;
            return (
            <li
              key={keyDate.id}
              className={`flex min-w-0 items-start gap-3 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-4 py-4 ${isLastOddItem ? "sm:col-span-2" : ""}`}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#061b2b] text-[10px] font-black text-[#ffb21c]">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-black text-[#071826]">
                  {localize(isMerged ? MERGED_SUBMISSION_OPENING_LABEL : KEY_DATE_TYPE_LABELS[keyDate.type], locale)}
                  {keyDate.mandatory && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      {localize(uiText.mandatory, locale)}
                    </span>
                  )}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-[#64717c]">
                  {localize(keyDate.notes ?? (isMerged ? MERGED_SUBMISSION_OPENING_DESCRIPTION : KEY_DATE_TYPE_DESCRIPTIONS[keyDate.type]), locale)}
                </p>
              </div>
              <span className="ml-auto whitespace-nowrap text-sm font-black text-[#b86e00]">
                {formatDate(keyDate.date, locale)}
              </span>
            </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
