"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatEstimatedValueUsd, formatDate } from "@/lib/format";
import { exchangeRateNote } from "@/lib/currency";
import { STALE_WITHOUT_END_DATE_DAYS } from "@/lib/tender-status";
import {
  GOVERNMENT_LEVEL_LABELS,
  PARTICIPATION_SCOPE_LABELS,
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  industryLabel,
} from "@/lib/tender-labels";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";

function Field({ label, value, emphasized = false, note }: { label: string; value: string; emphasized?: boolean; note?: string | null }) {
  return (
    <div className={`flex min-h-24 flex-col rounded-2xl px-4 py-4 ${emphasized ? "bg-[#fff4d8]" : "bg-[#f2f4f3]"}`}>
      <dt className="text-[11px] font-bold tracking-[0.03em] text-[#7a878f]">{label}</dt>
      <dd className={`mt-1 text-sm font-black leading-5 ${emphasized ? "text-[#9a6200]" : "text-[#071826]"}`}>{value}</dd>
      {note && <p className="mt-1 text-[10px] font-normal leading-4 text-[#9aa5ab]">{note}</p>}
    </div>
  );
}

export function TenderOverview({ tender, showTrialCta = false }: { tender: Tender; showTrialCta?: boolean }) {
  const { locale } = useLocale();
  const fieldCount = 8
    + (tender.participationScope ? 1 : 0)
    + (tender.awardedTo ? 1 : 0)
    + (tender.awardedValue !== undefined ? 1 : 0)
    + (tender.awardDate ? 1 : 0);
  const desktopGrid = fieldCount % 4 === 0 ? "xl:grid-cols-4" : "xl:grid-cols-3";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {tender.industries.map((industry) => (
            <span
              key={industry}
              className="shrink-0 whitespace-nowrap rounded-full bg-[#edf2f3] px-2.5 py-1 text-xs font-semibold text-[#24465a]"
            >
              {industryLabel(industry, locale)}
            </span>
          ))}
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tender.status]}`}
          >
            {localize(STATUS_LABELS[tender.status], locale)}
          </span>
          <span className="text-xs text-[#849098]">{tender.tenderNumber}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showTrialCta && (
            <Link href={`/register?next=${encodeURIComponent(`/tenders/${tender.slug}`)}`} className="inline-flex h-10 items-center rounded-xl bg-[#ffb21c] px-4 text-xs font-black text-[#071826] hover:bg-[#ffc247]">
              注册即可免费试用3天
            </Link>
          )}
          <SaveTenderButton tenderId={tender.id} className="border border-[#dbe2e5] bg-white" />
        </div>
      </div>

      {/* Chinese leads when a real translation exists (this platform's
          readers work in Chinese first) — Spanish stays visible as the
          smaller reference line, since that's the text that actually
          matches the official documents. Without a translation yet,
          Spanish is all there is, so it carries the heading alone. */}
      {tender.title.zh !== tender.title.es ? (
        <>
          <h1 className="max-w-4xl text-2xl font-black leading-[1.25] tracking-[-0.035em] text-[#071826] sm:text-3xl">
            {tender.title.zh}
          </h1>
          <div className="-mt-1 flex items-start gap-2 text-sm leading-6 text-[#7a878f]">
            <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.08em] text-[#9aa5ab]">原文</span>
            <p>{tender.title.es}</p>
          </div>
        </>
      ) : (
        <h1 className="text-xl font-bold leading-snug text-black">
          {tender.title.es}
        </h1>
      )}

      {![tender.title.zh, tender.title.es].includes(localize(tender.summary, locale).trim()) && (
        <div className="rounded-xl border-l-4 border-[#ffb21c] bg-[#fff8e9] px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#9a6200]">项目摘要</p>
          <p className="mt-1 text-sm leading-6 text-[#425461]">{localize(tender.summary, locale)}</p>
        </div>
      )}

      <dl className={`grid grid-cols-1 gap-3 border-t border-[#e4e9eb] pt-5 sm:grid-cols-2 ${desktopGrid}`}>
        <Field label={localize(uiText.buyer, locale)} value={tender.buyer} />
        <Field
          label={localize(uiText.governmentLevelLabel, locale)}
          value={localize(GOVERNMENT_LEVEL_LABELS[tender.governmentLevel], locale)}
        />
        <Field
          label={localize(uiText.scopeLabel, locale)}
          value={localize(SCOPE_TYPE_LABELS[tender.scopeType], locale)}
        />
        <Field
          label={localize(uiText.procedureType, locale)}
          value={tender.procedureType}
        />
        {tender.participationScope && (
          <Field
            label={localize(uiText.participationScopeLabel, locale)}
            value={localize(PARTICIPATION_SCOPE_LABELS[tender.participationScope], locale)}
            emphasized
          />
        )}
        <Field
          label={localize(uiText.locationLabel, locale)}
          value={tender.location ?? tender.country}
        />
        <Field
          label={localize(uiText.estimatedValue, locale)}
          value={
            (tender.estimatedValue !== undefined
              ? formatEstimatedValueUsd(tender.estimatedValue, tender.currency, locale)
              : null) ?? "—"
          }
          note={tender.estimatedValue !== undefined ? exchangeRateNote(tender.currency, locale) : null}
        />
        <Field
          label={localize(tender.publicationDateIsEstimated ? uiText.ingestedDateLabel : uiText.publicationDateLabel, locale)}
          value={formatDate(tender.publicationDate, locale)}
        />
        {/*
          Says which kind of "no date" this is. 待公布 used to stand here and
          on the list rows, and for Peru's OECE records it is simply untrue —
          that source publishes no deadline field at all, so nothing is ever
          going to be 公布. Worse once rule 5 (lib/tender-status.ts) began
          closing these: the reader saw 已截止 next to 待公布, a contradiction
          with no explanation anywhere on the page.
        */}
        <Field
          label="计划交标"
          value={
            tender.submissionDeadline
              ? formatDate(tender.submissionDeadline, locale)
              : tender.status === "submission_closed"
                ? `数据源未提供 · 已按发布满 ${STALE_WITHOUT_END_DATE_DAYS} 天推定截止`
                : "数据源未提供"
          }
          emphasized
        />
        {(tender.awardedTo || tender.awardedValue !== undefined) && (
          <>
            {tender.awardedTo && <Field label={localize(uiText.awardedToLabel, locale)} value={tender.awardedTo} emphasized />}
            {tender.awardedValue !== undefined && (
              <Field
                label={localize(uiText.awardedValueLabel, locale)}
                value={formatEstimatedValueUsd(tender.awardedValue, tender.currency, locale) ?? "—"}
                note={exchangeRateNote(tender.currency, locale)}
                emphasized
              />
            )}
            {tender.awardDate && <Field label={localize(uiText.awardDateLabel, locale)} value={formatDate(tender.awardDate, locale)} />}
          </>
        )}
      </dl>
    </section>
  );
}
