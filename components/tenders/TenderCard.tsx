"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  RELEVANCE_TIER_COLORS,
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/tender-labels";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";

export function TenderCard({ tender }: { tender: Tender }) {
  const { locale } = useLocale();

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
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
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-xs text-zinc-400">
            {tender.tenderNumber}
          </span>
          <SaveTenderButton tenderId={tender.id} className="relative z-10" />
        </div>
      </div>

      {/* Its own full-width block, not squeezed into the flex-wrap badge
          row above — this label's text is long enough to wrap onto
          multiple lines, which looked broken crammed into a rounded-full
          pill sized for short one-line tags. */}
      {(tender.relevance.tier === "flagship" || tender.relevance.tier === "significant") && (
        <span
          title={localize(tender.relevance.reason, locale)}
          className={`-mt-1 block w-fit rounded-lg px-2.5 py-1 text-xs font-medium leading-snug ${RELEVANCE_TIER_COLORS[tender.relevance.tier]}`}
        >
          {tender.relevance.tier === "flagship" ? "★ " : ""}
          {localize(tender.relevance.label, locale)}
        </span>
      )}

      <h3 className="flex items-baseline gap-1.5 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
        <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium leading-none text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          ES
        </span>
        <Link href={`/tenders/${tender.slug}`} className="after:absolute after:inset-0 group-hover:underline">
          {tender.title.es}
        </Link>
      </h3>
      {/* Only a real translation (Layer 2 AI, not the es/zh mirror
          untranslated() produces) makes this line worth showing —
          otherwise it would just repeat the Spanish title verbatim. */}
      {tender.title.zh !== tender.title.es && (
        <p className="-mt-2 flex items-baseline gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium leading-none text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            译
          </span>
          {tender.title.zh}
        </p>
      )}

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
    </div>
  );
}
