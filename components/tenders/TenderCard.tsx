"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/tender-labels";

export function TenderCard({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

  return (
    <Link
      href={`/tenders/${tender.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {tender.industry}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tender.status]}`}
          >
            {localize(STATUS_LABELS[tender.status], locale)}
          </span>
        </div>
        <span className="whitespace-nowrap text-xs text-zinc-400">
          {tender.tenderNumber}
        </span>
      </div>

      <h3 className="text-base font-semibold leading-snug text-zinc-900 group-hover:underline dark:text-zinc-50">
        {localize(tender.title, locale)}
      </h3>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {tender.buyer} · {tender.location ?? tender.country}
      </p>

      <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
        {localize(tender.summary, locale)}
      </p>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
        <div>
          <div className="text-xs text-zinc-400">
            {localize(uiText.estimatedValue, locale)}
          </div>
          <div className="font-medium text-zinc-900 dark:text-zinc-50">
            {tender.estimatedValue && tender.currency
              ? formatCurrency(tender.estimatedValue, tender.currency, locale)
              : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">
            {localize(uiText.submissionDeadline, locale)}
          </div>
          <div className="font-medium text-zinc-900 dark:text-zinc-50">
            {tender.submissionDeadline
              ? formatDate(tender.submissionDeadline, locale)
              : "—"}
          </div>
        </div>
      </div>

      <span className="text-xs font-medium text-zinc-500">
        {localize(SCOPE_TYPE_LABELS[tender.scopeType], locale)}
      </span>
    </Link>
  );
}
