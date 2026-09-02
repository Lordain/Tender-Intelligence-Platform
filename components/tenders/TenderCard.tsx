"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import {
  RELEVANCE_TIER_COLORS,
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  countryLabel,
  industryLabel,
} from "@/lib/tender-labels";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";

export function TenderCard({ tender }: { tender: Tender }) {
  const { locale } = useLocale();
  // Only a real translation (Layer 2 AI, not the es/zh mirror untranslated()
  // produces) makes Chinese worth treating as the primary heading — until
  // then the Spanish original is all there is to show.
  const hasRealTranslation = tender.title.zh !== tender.title.es;

  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-zinc-200 p-3.5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {tender.industries.map((industry) => (
            <span
              key={industry}
              className="shrink-0 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {industryLabel(industry, locale)}
            </span>
          ))}
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[tender.status]}`}
          >
            {localize(STATUS_LABELS[tender.status], locale)}
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {localize(SCOPE_TYPE_LABELS[tender.scopeType], locale)}
          </span>
        </div>
        <SaveTenderButton tenderId={tender.id} className="relative z-10 shrink-0" />
      </div>

      {/* Its own full-width block, not squeezed into the flex-wrap badge
          row above — this label's text is long enough to wrap onto
          multiple lines, which looked broken crammed into a rounded-full
          pill sized for short one-line tags. */}
      {(tender.relevance.tier === "flagship" || tender.relevance.tier === "significant") && (
        <span
          title={localize(tender.relevance.reason, locale)}
          className={`block w-fit rounded-lg px-2 py-0.5 text-[11px] font-medium leading-snug ${RELEVANCE_TIER_COLORS[tender.relevance.tier]}`}
        >
          {tender.relevance.tier === "flagship" ? "★ " : ""}
          {localize(tender.relevance.label, locale)}
        </span>
      )}

      {/* Chinese leads when a real translation exists (this platform's
          readers work in Chinese first) — Spanish stays visible as the
          small reference line underneath, since that's the text that
          actually matches the official documents. Without a translation
          yet, Spanish is all there is, so it carries the heading alone. */}
      {hasRealTranslation ? (
        <>
          <h3 className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            <Link href={`/tenders/${tender.slug}`} className="after:absolute after:inset-0 group-hover:underline">
              {tender.title.zh}
            </Link>
          </h3>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{tender.title.es}</p>
        </>
      ) : (
        <h3 className="text-xs font-medium leading-snug text-zinc-600 dark:text-zinc-400">
          <Link href={`/tenders/${tender.slug}`} className="after:absolute after:inset-0 group-hover:underline">
            {tender.title.es}
          </Link>
        </h3>
      )}

      <p className="line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
        {localize(tender.summary, locale)}
      </p>

      {tender.submissionDeadline && (
        <p className="text-xs text-zinc-400">
          {localize(uiText.submissionDeadline, locale)}
          {"："}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {formatDate(tender.submissionDeadline, locale)}
          </span>
        </p>
      )}

      <p className="mt-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {countryLabel(tender.country, locale)}
        {" · "}
        {localize(uiText.buyerLabelCard, locale)}
        {"："}
        {tender.buyer}
      </p>
    </div>
  );
}
