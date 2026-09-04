"use client";

import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatEstimatedValueUsd, formatDate } from "@/lib/format";
import {
  GOVERNMENT_LEVEL_LABELS,
  PARTICIPATION_SCOPE_LABELS,
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  industryLabel,
} from "@/lib/tender-labels";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[#849098]">{label}</dt>
      <dd className="mt-1 font-bold text-[#071826]">{value}</dd>
    </div>
  );
}

export function TenderOverview({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-8">
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
        <SaveTenderButton tenderId={tender.id} className="border border-[#dbe2e5] bg-white" />
      </div>

      {/* Chinese leads when a real translation exists (this platform's
          readers work in Chinese first) — Spanish stays visible as the
          smaller reference line, since that's the text that actually
          matches the official documents. Without a translation yet,
          Spanish is all there is, so it carries the heading alone. */}
      {tender.title.zh !== tender.title.es ? (
        <>
          <h1 className="text-3xl font-black leading-tight tracking-[-0.03em] text-black sm:text-4xl">
            {tender.title.zh}
          </h1>
          <p className="-mt-2 text-sm text-[#7a878f]">{tender.title.es}</p>
        </>
      ) : (
        <h1 className="text-xl font-bold leading-snug text-black">
          {tender.title.es}
        </h1>
      )}

      <p className="text-base leading-7 text-[#52636e]">
        {localize(tender.summary, locale)}
      </p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-[#e4e9eb] pt-6 sm:grid-cols-3">
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
        />
        <Field
          label={localize(tender.publicationDateIsEstimated ? uiText.ingestedDateLabel : uiText.publicationDateLabel, locale)}
          value={formatDate(tender.publicationDate, locale)}
        />
        <Field
          label="计划交标"
          value={
            tender.submissionDeadline
              ? formatDate(tender.submissionDeadline, locale)
              : "—"
          }
        />
        {tender.awardedTo && (
          <Field label={localize(uiText.awardedToLabel, locale)} value={tender.awardedTo} />
        )}
      </dl>
    </section>
  );
}
