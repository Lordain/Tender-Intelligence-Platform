"use client";

import Link from "next/link";
import type { TenderCardData } from "@/lib/tender-card";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate, formatEstimatedValueUsdMillions } from "@/lib/format";
import { countryLabel } from "@/lib/tender-labels";
import { TenderTagRow } from "@/components/tenders/TenderTagRow";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { publicTenderPath } from "@/lib/public-tender-url";

export function TenderCard({
  tender,
  showOneLineSummary = false,
}: {
  tender: TenderCardData;
  showOneLineSummary?: boolean;
}) {
  const { locale } = useLocale();
  const detailHref = `${publicTenderPath(tender)}${showOneLineSummary ? "?from=homepage" : ""}`;
  // The original-language title is present only for a member (see
  // toTenderCardData) — which is also exactly the condition under which the
  // Chinese heading is a real translation rather than the safe placeholder,
  // so this one field answers both questions.
  const titleOriginal = tender.titleOriginal;
  // Band first: if a future change ever set both, the safe one must win.
  const value = tender.estimatedValueBand
    ?? (tender.estimatedValue !== undefined ? formatEstimatedValueUsdMillions(tender.estimatedValue, tender.currency, locale) : null)
    ?? tender.undisclosedValueBand
    ?? null;
  const previews = [
    showOneLineSummary && tender.oneLineSummary && { label: "一句话总结", text: tender.oneLineSummary, strong: false, summary: true },
    tender.qualification && { label: "资质要求", text: localize(tender.qualification.title, locale), strong: tender.qualification.strong, summary: false },
    tender.experience && { label: "经验要求", text: localize(tender.experience.title, locale), strong: tender.experience.strong, summary: false },
    tender.document && { label: "所需文件", text: localize(tender.document.title, locale), strong: tender.document.strong, summary: false },
    tender.risk && { label: "风险提示", text: localize(tender.risk.title, locale), strong: tender.risk.strong, summary: false },
  ].filter(Boolean) as { label: string; text: string; strong: boolean; summary: boolean }[];

  return (
    <article className="group relative flex h-full flex-col gap-3 rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 transition-all hover:-translate-y-0.5 hover:border-[#aebdc3] hover:shadow-[0_18px_50px_-32px_rgba(6,27,43,0.45)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TenderTagRow
            relevanceTier={tender.relevanceTier}
            industries={tender.industries}
            status={tender.status}
            scopeType={tender.scopeType}
            isObrasPorImpuestos={tender.isObrasPorImpuestos}
          />
        </div>
        <SaveTenderButton tenderId={tender.id} className="relative z-10 shrink-0" />
      </div>

      {/* Chinese always leads. The original-language line underneath is the
          text that matches the official documents, which is precisely why it
          is a member-only field: it is the shortest path from this card to
          the source portal. A guest gets the Chinese heading alone. */}
      {/* min-h reserves two lines. Titles run one to three lines depending on
          the project, and without a floor every block below sat at a different
          height across a row of cards — the 高高矮矮 the user reported
          (2026-09-20). Nothing is clamped, so a three-line title still shows
          in full; this only stops a short one from pulling its card up. */}
      <h3 className="min-h-[2.75rem] text-base font-black leading-snug text-black">
        <Link href={detailHref} data-public-tender-link className="after:absolute after:inset-0">
          {tender.titleZh}
        </Link>
      </h3>
      {titleOriginal && <p className="line-clamp-1 text-xs text-[#75838c]">{titleOriginal}</p>}

      {/* Absent on the free-preview cards, where 一句话总结 already leads the
          block below and says the same thing. Not a CSS hide: toTenderCardData
          does not project the field at all in that case. */}
      {tender.summaryZh && (
        <p className="line-clamp-2 text-xs leading-5 text-[#61717c]">
          {tender.summaryZh}
        </p>
      )}

      {previews.length > 0 && (
        <div className="rounded-xl border border-[#e2e7e9] bg-[#f7f9f8] px-3 py-2.5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#73818a]">投标重点预览</p>
          <ul className="space-y-1.5">
            {previews.map((preview) => (
              <li key={preview.label} className={`grid min-w-0 grid-cols-[4.75rem_minmax(0,1fr)] gap-2 text-xs leading-5 ${preview.summary ? "border-b border-[#e1e7e9] pb-2" : ""}`}>
                <span className={`font-bold ${preview.summary ? "text-[#a96100]" : preview.strong ? "text-[#b42318]" : "text-[#586b77]"}`}>{preview.label}</span>
                <span className={preview.summary ? "line-clamp-2 min-h-[2.5rem] font-semibold text-[#172c3b]" : "truncate text-[#425461]"}>{preview.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Two dates side by side, publication left and deadline right
          (2026-09-20). mt-auto on the row rather than on one card inside it,
          so the pair is what gets pushed to the bottom and both stay aligned
          across a row of cards whatever happened above them.

          The deadline keeps the amber treatment because it is the date a
          bidder acts on; the publication date is the quieter one, and it is
          labelled 收录日期 when the stored value is when we first saw the
          tender rather than when it was published. */}
      <div className="mt-auto grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#f1f4f5] px-3 py-2.5">
          <p className="text-[11px] font-medium text-[#66757f]">
            {localize(tender.publicationDateIsEstimated ? uiText.ingestedDateLabel : uiText.publicationDateLabel, locale)}
          </p>
          <span className="mt-0.5 block text-sm font-bold text-[#071826]">
            {formatDate(tender.publicationDate, locale)}
          </span>
        </div>
        <div className="rounded-xl bg-[#fff6df] px-3 py-2.5">
          <p className="text-[11px] font-medium text-[#966000]">计划交标</p>
          <span className="mt-0.5 block text-sm font-bold text-[#071826]">
            {tender.submissionDeadline ? formatDate(tender.submissionDeadline, locale) : "未提供"}
          </span>
        </div>
      </div>

      <p className="flex items-start gap-1.5 border-t border-[#e6eaec] pt-3 text-xs leading-5 text-[#586873]">
        <CountryFlag country={tender.country} className="mt-[3px]" />
        <span>{countryLabel(tender.country, locale)}
        {tender.buyer !== undefined && <>
          {" · "}
          {localize(uiText.buyerLabelCard, locale)}
          {"："}
          {tender.buyer}
        </>}
        {value !== null && <>{" · "}{value}</>}</span>
      </p>
      <Link href={detailHref} data-public-tender-link className="relative z-10 mt-1 inline-flex w-full items-center justify-center rounded-xl bg-[#071826] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#163b52]">
        查看招标信息
      </Link>
    </article>
  );
}
