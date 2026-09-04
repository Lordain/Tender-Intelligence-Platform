"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import {
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  countryLabel,
  industryLabel,
} from "@/lib/tender-labels";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";
import { CountryFlag } from "@/components/tenders/CountryFlag";

export function TenderCard({ tender }: { tender: Tender }) {
  const { locale } = useLocale();
  // Only a real translation (Layer 2 AI, not the es/zh mirror untranslated()
  // produces) makes Chinese worth treating as the primary heading — until
  // then the Spanish original is all there is to show.
  const hasRealTranslation = tender.title.zh !== tender.title.es;

  return (
    <article className="group relative flex h-full flex-col gap-3 rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 transition-all hover:-translate-y-0.5 hover:border-[#aebdc3] hover:shadow-[0_18px_50px_-32px_rgba(6,27,43,0.45)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {tender.industries.map((industry) => (
            <span
              key={industry}
              className="shrink-0 whitespace-nowrap rounded-full bg-[#edf2f3] px-2.5 py-1 text-[11px] font-semibold text-[#24465a]"
            >
              {industryLabel(industry, locale)}
            </span>
          ))}
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[tender.status]}`}
          >
            {localize(STATUS_LABELS[tender.status], locale)}
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-full border border-[#d8e0e3] px-2.5 py-1 text-[11px] font-medium text-[#566773]">
            {localize(SCOPE_TYPE_LABELS[tender.scopeType], locale)}
          </span>
        </div>
        <SaveTenderButton tenderId={tender.id} className="relative z-10 shrink-0" />
      </div>

      {/* Chinese leads when a real translation exists (this platform's
          readers work in Chinese first) — Spanish stays visible as the
          small reference line underneath, since that's the text that
          actually matches the official documents. Without a translation
          yet, Spanish is all there is, so it carries the heading alone. */}
      {hasRealTranslation ? (
        <>
          <h3 className="text-base font-black leading-snug text-black">
            <Link href={`/tenders/${tender.slug}`} className="after:absolute after:inset-0">
              {tender.title.zh}
            </Link>
          </h3>
          <p className="line-clamp-1 text-xs text-[#75838c]">{tender.title.es}</p>
        </>
      ) : (
        <h3 className="text-sm font-bold leading-snug text-black">
          <Link href={`/tenders/${tender.slug}`} className="after:absolute after:inset-0">
            {tender.title.es}
          </Link>
        </h3>
      )}

      <p className="line-clamp-2 text-xs leading-5 text-[#61717c]">
        {localize(tender.summary, locale)}
      </p>

      {tender.submissionDeadline && (
        <div className="mt-auto rounded-xl bg-[#fff6df] px-3 py-2.5">
          <p className="text-[11px] font-medium text-[#966000]">计划交标</p>
          <span className="mt-0.5 block text-sm font-bold text-[#071826]">
            {formatDate(tender.submissionDeadline, locale)}
          </span>
        </div>
      )}

      <p className="flex items-start gap-1.5 border-t border-[#e6eaec] pt-3 text-xs leading-5 text-[#586873]">
        <CountryFlag country={tender.country} className="mt-[3px]" />
        <span>{countryLabel(tender.country, locale)}
        {" · "}
        {localize(uiText.buyerLabelCard, locale)}
        {"："}
        {tender.buyer}</span>
      </p>
    </article>
  );
}
