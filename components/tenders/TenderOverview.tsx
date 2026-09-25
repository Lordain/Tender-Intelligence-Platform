"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatEstimatedValueUsd, formatDate } from "@/lib/format";
import { exchangeRateNote } from "@/lib/currency";
import { TRIAL_DAYS } from "@/lib/access-control";
import {
  GOVERNMENT_LEVEL_LABELS,
  PARTICIPATION_SCOPE_LABELS,
  SCOPE_TYPE_LABELS,
  countryLabel,
} from "@/lib/tender-labels";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { TenderTagRow } from "@/components/tenders/TenderTagRow";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";
import { publicTenderPath } from "@/lib/public-tender-url";
import { shortTitleOf } from "@/lib/public-title";

function Field({ label, value, emphasized = false, note }: { label: string; value: string; emphasized?: boolean; note?: string | null }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border px-5 py-4 ${emphasized ? "border-[#f2dba2] bg-[#fff9eb]" : "border-[#e4e9eb] bg-white"}`}>
      <dt className="text-xs font-bold text-[#75838c]">{label}</dt>
      <dd className={`mt-2 break-words text-base font-black leading-6 ${emphasized ? "text-[#9a6200]" : "text-[#071826]"}`}>{value}</dd>
      {note && <p className="mt-1 text-xs leading-5 text-[#7a878f]">{note}</p>}
    </div>
  );
}

export function TenderOverview({ tender, showTrialCta = false }: { tender: Tender; showTrialCta?: boolean }) {
  const heading = shortTitleOf(tender);
  const { locale } = useLocale();
  // A planned award date is not a result; show it in this block only when
  // there is an actual awarded supplier or value.
  const hasAwardResult = Boolean(tender.awardedTo) || tender.awardedValue !== undefined;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-[#536772]">
            <CountryFlag country={tender.country} />
            {countryLabel(tender.country, locale)}
          </span>
          <TenderTagRow
            relevanceTier={tender.relevance.tier}
            industries={tender.industries}
            status={tender.status}
            scopeType={tender.scopeType}
            size="md"
          />
          <span className="text-xs text-[#849098]">{tender.tenderNumber}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showTrialCta && (
            <Link href={`/register?next=${encodeURIComponent(publicTenderPath(tender))}`} className="inline-flex h-10 items-center rounded-xl bg-[#ffb21c] px-4 text-xs font-black text-[#071826] hover:bg-[#ffc247]">
              注册即可免费试用{TRIAL_DAYS}天
            </Link>
          )}
          <SaveTenderButton tenderId={tender.id} className="border border-[#dbe2e5] bg-white" />
        </div>
      </div>

      {/* Chinese leads when a real translation exists (this platform's
          readers work in Chinese first) — Spanish stays visible as the
          smaller reference line, since that's the text that actually
          matches the official documents. Without a translation yet,
          Spanish is all there is, so it carries the heading alone.

          shortTitleOf(), not title.zh. A faithful translation of a source
          title is a faithful translation of an administrative sentence
          （公开招标（电子）第023/2026号——…，位于卡瓦柳街与火烈鸟大道交汇处）,
          and nothing is lost by condensing it here: the procurement number
          has its own field, the full translation stays in the database for
          the admin screens, and the 原文 line directly below is the text a
          bidder actually matches against the documents. */}
      {tender.title.zh !== tender.title.es ? (
        <>
          <h1 className="max-w-4xl text-2xl font-black leading-[1.25] tracking-[-0.035em] text-[#071826] sm:text-3xl">
            {heading}
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

      {/*
        Compared against what is actually RENDERED above, not against
        title.zh. This block exists so the same sentence is not printed
        twice, and most rows carry a summary that is a verbatim copy of the
        title because the source published no separate description (see
        translate-titles-qwen.ts). Comparing against the full translation
        while the heading shows the condensed one hid the summary on exactly
        those rows — where it had just become the only place the full text
        appeared, and therefore new information rather than a repeat.
      */}
      {![heading, tender.title.es].includes(localize(tender.summary, locale).trim()) && (
        <div className="rounded-xl border-l-4 border-[#ffb21c] bg-[#fff8e9] px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#9a6200]">项目摘要</p>
          <p className="mt-1 text-sm leading-6 text-[#425461]">{localize(tender.summary, locale)}</p>
        </div>
      )}

      <div className="border-t border-[#e4e9eb] pt-6">
        <h2 className="mb-3 text-sm font-black text-[#071826]">项目概览</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={localize(uiText.buyer, locale)} value={tender.buyer} />
          <Field label={localize(uiText.locationLabel, locale)} value={tender.location ?? countryLabel(tender.country, locale)} />
        </dl>
        <dl className={`mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 ${tender.participationScope ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          <Field label={localize(uiText.governmentLevelLabel, locale)} value={localize(GOVERNMENT_LEVEL_LABELS[tender.governmentLevel], locale)} />
          <Field label={localize(uiText.scopeLabel, locale)} value={localize(SCOPE_TYPE_LABELS[tender.scopeType], locale)} />
          <Field label={localize(uiText.procedureType, locale)} value={tender.procedureType} />
          {tender.participationScope && <Field label={localize(uiText.participationScopeLabel, locale)} value={localize(PARTICIPATION_SCOPE_LABELS[tender.participationScope], locale)} emphasized />}
        </dl>
        <dl className="mt-3">
          <Field
            label={localize(uiText.estimatedValue, locale)}
            value={tender.estimatedValue !== undefined ? formatEstimatedValueUsd(tender.estimatedValue, tender.currency, locale) ?? "未公开" : "未公开"}
            note={tender.estimatedValue !== undefined ? exchangeRateNote(tender.currency, locale) : null}
          />
        </dl>
        {hasAwardResult && (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tender.awardedTo && <Field label={localize(uiText.awardedToLabel, locale)} value={tender.awardedTo} emphasized />}
            {tender.awardedValue !== undefined && <Field label={localize(uiText.awardedValueLabel, locale)} value={formatEstimatedValueUsd(tender.awardedValue, tender.currency, locale) ?? "未公开"} note={exchangeRateNote(tender.currency, locale)} emphasized />}
            {tender.awardDate && <Field label={localize(uiText.awardDateLabel, locale)} value={formatDate(tender.awardDate, locale)} />}
          </dl>
        )}
      </div>
    </section>
  );
}
