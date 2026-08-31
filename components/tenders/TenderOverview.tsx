"use client";

import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  GOVERNMENT_LEVEL_LABELS,
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/tender-labels";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">{value}</dd>
    </div>
  );
}

export function TenderOverview({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {tender.industry}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tender.status]}`}
          >
            {localize(STATUS_LABELS[tender.status], locale)}
          </span>
          <span className="text-xs text-zinc-400">{tender.tenderNumber}</span>
        </div>
        <SaveTenderButton tenderId={tender.id} className="border border-zinc-200 dark:border-zinc-800" />
      </div>

      <h1 className="text-2xl font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
        {localize(tender.title, locale)}
      </h1>

      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {localize(tender.summary, locale)}
      </p>

      <dl className="grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-3 dark:border-zinc-800">
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
        <Field
          label={localize(uiText.locationLabel, locale)}
          value={tender.location ?? tender.country}
        />
        <Field
          label={localize(uiText.estimatedValue, locale)}
          value={
            tender.estimatedValue && tender.currency
              ? formatCurrency(tender.estimatedValue, tender.currency, locale)
              : "—"
          }
        />
        <Field
          label={localize(uiText.publicationDateLabel, locale)}
          value={formatDate(tender.publicationDate, locale)}
        />
        <Field
          label={localize(uiText.submissionDeadline, locale)}
          value={
            tender.submissionDeadline
              ? formatDate(tender.submissionDeadline, locale)
              : "—"
          }
        />
      </dl>
    </section>
  );
}
