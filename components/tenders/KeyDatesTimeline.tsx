"use client";

import type { TenderKeyDate, TenderStatus } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { KEY_DATE_TYPE_LABELS, KEY_DATE_TYPE_DESCRIPTIONS } from "@/lib/tender-labels";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";
import { TimelineTrack } from "@/components/tenders/TimelineTrack";
import { STALE_WITHOUT_END_DATE_DAYS } from "@/lib/tender-status";

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

export function KeyDatesTimeline({ dates, publicationDate, publicationDateIsEstimated = false, submissionDeadline, status }: {
  dates: TenderKeyDate[];
  publicationDate: string;
  publicationDateIsEstimated?: boolean;
  submissionDeadline?: string;
  status: TenderStatus;
}) {
  const { locale } = useLocale();
  const datedEvents = [...dates];
  if (!datedEvents.some((date) => date.type === "publication")) {
    datedEvents.push({ id: "overview-publication", type: "publication", date: publicationDate });
  }
  if (submissionDeadline && !datedEvents.some((date) => date.type === "submission" || date.type === "opening")) {
    datedEvents.push({ id: "overview-submission", type: "submission", date: submissionDeadline });
  }
  const sorted = [...mergeSameDaySubmissionAndOpening(datedEvents)].sort((a, b) => a.date.localeCompare(b.date));
  // Keep the timeline to the four decision-making milestones. Other dates
  // remain visible below it; a separate opening is not silently treated as
  // the submission deadline.
  const primary = [
    sorted.find((date) => date.type === "publication"),
    sorted.find((date) => date.type === "questions_deadline"),
    sorted.find((date) => date.type === "submission") ?? sorted.find((date) => date.type === "opening"),
    sorted.find((date) => date.type === "award"),
  ].filter((date): date is TenderKeyDate => Boolean(date)).sort((a, b) => a.date.localeCompare(b.date));
  const primaryIds = new Set(primary.map((date) => date.id));
  const otherDates = sorted.filter((date) => !primaryIds.has(date.id));
  const primaryWithNotes = primary.filter((date) => date.notes);
  const missingSubmission = !submissionDeadline && !sorted.some((date) => date.type === "submission" || date.type === "opening");

  const dateLabel = (keyDate: TenderKeyDate) => keyDate.id === "overview-publication" && publicationDateIsEstimated
    ? localize(uiText.ingestedDateLabel, locale)
    : localize(keyDate.id.includes("+") ? MERGED_SUBMISSION_OPENING_LABEL : KEY_DATE_TYPE_LABELS[keyDate.type], locale);

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading
        title={localize(uiText.criticalDates, locale)}
        description="发布、提问截止、提交与开标及中标结果；其他安排见下方"
        count={primary.length}
      />
      <div className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] px-6 py-5 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:px-8">
        {primary.length === 0 ? (
          <p className="text-sm text-[#64717c]">{localize(uiText.noneListed, locale)}</p>
        ) : (
          <TimelineTrack items={primary.map((keyDate) => ({
              id: keyDate.id,
              label: dateLabel(keyDate),
              date: formatDate(keyDate.date, locale),
              accent: keyDate.type === "submission" || keyDate.type === "opening",
              badge: keyDate.mandatory ? <span className="rounded-full bg-[#fff0ed] px-2 py-0.5 text-[10px] font-bold text-[#a34030]">{localize(uiText.mandatory, locale)}</span> : undefined,
            }))} />
        )}
      </div>
      {(otherDates.length > 0 || primaryWithNotes.length > 0 || missingSubmission) && (
        <div className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] px-6 py-6 sm:px-8">
          <h3 className="text-sm font-black text-[#071826]">其他时间安排与节点说明</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {otherDates.map((keyDate) => (
              <div key={keyDate.id} className="rounded-2xl bg-[#f4f7f7] px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-[#071826]">{dateLabel(keyDate)}</p>
                  <p className="text-sm font-black tabular-nums text-[#425461]">{formatDate(keyDate.date, locale)}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#75838c]">{localize(keyDate.notes ?? KEY_DATE_TYPE_DESCRIPTIONS[keyDate.type], locale)}</p>
              </div>
            ))}
            {primaryWithNotes.map((keyDate) => (
              <div key={`${keyDate.id}-note`} className="rounded-2xl bg-[#f4f7f7] px-4 py-3">
                <p className="text-sm font-bold text-[#071826]">{dateLabel(keyDate)}说明</p>
                <p className="mt-1 text-xs leading-5 text-[#75838c]">{localize(keyDate.notes ?? KEY_DATE_TYPE_DESCRIPTIONS[keyDate.type], locale)}</p>
              </div>
            ))}
            {missingSubmission && (
              <div className="rounded-2xl bg-[#fff9eb] px-4 py-3">
                <p className="text-sm font-bold text-[#9a6200]">计划交标日期未提供</p>
                <p className="mt-1 text-xs leading-5 text-[#75838c]">{status === "submission_closed"
                  ? `已按发布满 ${STALE_WITHOUT_END_DATE_DAYS} 天推定截止；并非官方交标日期。`
                  : "请以采购机构后续公告为准。"}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
