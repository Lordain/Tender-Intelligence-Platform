"use client";

import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/access-control";
import { loginPathFor } from "@/lib/auth-redirect";
import { formatDate } from "@/lib/format";
import { exchangeRateNote } from "@/lib/currency";
import { localize, uiText, useLocale } from "@/lib/i18n";
import {
  GOVERNMENT_LEVEL_LABELS,
  PARTICIPATION_SCOPE_LABELS,
  SCOPE_TYPE_LABELS,
  countryLabel,
} from "@/lib/tender-labels";
import { TenderTagRow } from "@/components/tenders/TenderTagRow";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { STALE_WITHOUT_END_DATE_DAYS } from "@/lib/tender-status";
import type { PublicTenderDetail } from "@/types/tender";

function Field({ label, value, emphasized = false, note }: { label: string; value: string; emphasized?: boolean; note?: string | null }) {
  return (
    <div className={`flex min-h-24 flex-col rounded-2xl px-4 py-4 ${emphasized ? "bg-[#fff4d8]" : "bg-[#f2f4f3]"}`}>
      <dt className="text-[11px] font-bold tracking-[0.03em] text-[#7a878f]">{label}</dt>
      <dd className={`mt-1 text-sm font-black leading-5 ${emphasized ? "text-[#9a6200]" : "text-[#071826]"}`}>{value}</dd>
      {note && <p className="mt-1 text-[10px] font-normal leading-4 text-[#9aa5ab]">{note}</p>}
    </div>
  );
}

export type TenderDetailPromptKind = "login" | "free-limit" | "basic-select-country" | "basic-other-country";

function ProtectedContentPrompt({ kind, nextPath }: { kind: TenderDetailPromptKind; nextPath: string }) {
  const isGuest = kind === "login";
  const isBasicWithoutCountry = kind === "basic-select-country";
  const isBasicOtherCountry = kind === "basic-other-country";
  const actionHref = isGuest ? `/register?next=${encodeURIComponent(nextPath)}` : isBasicWithoutCountry ? "/account" : "/pricing";
  const title = isGuest ? "注册后查看完整项目分析"
    : isBasicWithoutCountry ? "先选择基础版覆盖的国家"
    : isBasicOtherCountry ? "该项目不在基础版所选国家内"
    : "本月免费详情额度已用完";
  const description = isBasicWithoutCountry
    ? "基础个人版可选择一个国家查看完整项目分析。请先到账户页选择国家，选择后本订阅期内不可更换。"
    : isBasicOtherCountry
      ? "基础个人版只开放所选国家的完整项目详情；其他国家仍可浏览公开项目标题和摘要。若需查看全部国家，可升级至专业个人版。"
      : "完整页面包括项目编号与原文名称、关键日期、资质与经验要求、所需文件、风险提示，以及官方投标入口和检索说明。";

  return (
    <section className="overflow-hidden rounded-3xl border border-[#d8e0e3] bg-[#fffdf9] shadow-[0_24px_70px_-55px_rgba(6,27,43,.65)]">
      <div className="bg-[#061b2b] px-6 py-7 text-white sm:px-8 sm:py-8">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ffb21c]">完整参标情报</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/68">
          {description}
        </p>
      </div>
      <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-sm leading-6 text-[#64717c]">
          {isGuest ? `新用户可免费试用 ${TRIAL_DAYS} 天，无需绑定银行卡。`
            : isBasicWithoutCountry ? "选定国家后即可查看该国完整项目分析。"
              : isBasicOtherCountry ? "现有基础版权限不受影响。"
                : "免费版每月可查看 5 个完整项目，下月额度自动恢复。"}
        </p>
        <div className="flex shrink-0 flex-wrap gap-3">
          {isGuest && (
            <Link href={loginPathFor(nextPath)} className="inline-flex h-11 items-center justify-center rounded-xl border border-[#cfd9dd] px-5 text-sm font-black text-[#071826] hover:bg-[#f1f3f2]">
              已有账号，登录
            </Link>
          )}
          <Link href={actionHref} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] hover:bg-[#ffc247]">
            {isGuest ? "免费注册" : isBasicWithoutCountry ? "选择国家" : isBasicOtherCountry ? "查看升级方案" : "查看订阅方案"}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Search-indexable landing view. Receives only the public field allow-list. */
export function PublicTenderDetailView({ tender, promptKind }: { tender: PublicTenderDetail; promptKind: TenderDetailPromptKind }) {
  const { locale } = useLocale();
  const nextPath = `/tenders/${tender.publicSlug}`;
  const fieldCount = 7 + (tender.participationScope ? 1 : 0);
  // The FX disclaimer still applies to a band — the range itself is in USD,
  // converted from the source currency at the same fixed rate — so it stays,
  // with the subscription note appended rather than replacing it.
  const fxNote = exchangeRateNote(tender.currency, locale);
  const valueNote = tender.estimatedValueBand === null
    ? null
    : fxNote === null ? "订阅后可见精确金额" : `${fxNote} 订阅后可见精确金额。`;
  const desktopGrid = fieldCount % 4 === 0 ? "xl:grid-cols-4" : "xl:grid-cols-3";

  return (
    <main className="min-h-[65vh] bg-[#f6f4ef]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-7 sm:px-8 sm:py-9">
        <Link href="/tenders" className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#536772] transition-colors hover:text-[#b86e00]">
          <span aria-hidden="true">←</span> {localize(uiText.backToTenders, locale)}
        </Link>

        <article className="flex flex-col gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-[#536772]">
              <CountryFlag country={tender.country} />
              {countryLabel(tender.country, locale)}
            </span>
            <TenderTagRow
              relevanceTier={tender.relevanceTier}
              industries={tender.industries}
              status={tender.status}
              scopeType={tender.scopeType}
              size="md"
            />
          </div>

          <h1 className="max-w-4xl text-2xl font-black leading-[1.25] tracking-[-0.035em] text-[#071826] sm:text-3xl">
            {tender.titleZh}
          </h1>

          {![tender.titleZh].includes(tender.summaryZh.trim()) && (
            <div className="rounded-xl border-l-4 border-[#ffb21c] bg-[#fff8e9] px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#9a6200]">项目摘要</p>
              <p className="mt-1 text-sm leading-6 text-[#425461]">{tender.summaryZh}</p>
            </div>
          )}

          <dl className={`grid grid-cols-1 gap-3 border-t border-[#e4e9eb] pt-5 sm:grid-cols-2 ${desktopGrid}`}>
            <Field label={localize(uiText.governmentLevelLabel, locale)} value={localize(GOVERNMENT_LEVEL_LABELS[tender.governmentLevel], locale)} />
            <Field label={localize(uiText.scopeLabel, locale)} value={localize(SCOPE_TYPE_LABELS[tender.scopeType], locale)} />
            <Field label={localize(uiText.procedureType, locale)} value={tender.procedureType} />
            {tender.participationScope && (
              <Field label={localize(uiText.participationScopeLabel, locale)} value={localize(PARTICIPATION_SCOPE_LABELS[tender.participationScope], locale)} emphasized />
            )}
            {/*
              The four fields below are the redacted ones, and each says so.
              A field that silently loses precision reads as a broken or
              low-quality page — which costs a search ranking as well as a
              visitor — whereas one that names what it is holding back is an
              honest statement of where the subscription begins.
            */}
            <Field
              label={localize(uiText.locationLabel, locale)}
              value={countryLabel(tender.country, locale)}
              note="订阅后可见具体州/市"
            />
            <Field
              label={localize(uiText.estimatedValue, locale)}
              value={tender.estimatedValueBand ?? "—"}
              note={valueNote}
            />
            <Field
              label={localize(tender.publicationDateIsEstimated ? uiText.ingestedDateLabel : uiText.publicationDateLabel, locale)}
              value={formatDate(tender.publicationDate, locale)}
            />
            <Field
              label="计划交标"
              value={tender.submissionDeadline
                ? formatDate(tender.submissionDeadline, locale)
                : tender.status === "submission_closed"
                  ? `数据源未提供 · 已按发布满 ${STALE_WITHOUT_END_DATE_DAYS} 天推定截止`
                  : "数据源未提供"}
              note={tender.submissionDeadline ? "订阅后可见具体日期" : null}
              emphasized
            />
          </dl>
        </article>

        <ProtectedContentPrompt kind={promptKind} nextPath={nextPath} />
      </div>
    </main>
  );
}
