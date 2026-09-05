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

function preferredRequirement(items: Tender["qualifications"]) {
  return items.find((item) => item.mandatory) ?? items[0];
}

const RISK_PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function TenderCard({ tender }: { tender: Tender }) {
  const { locale } = useLocale();
  // Only a real translation (Layer 2 AI, not the es/zh mirror untranslated()
  // produces) makes Chinese worth treating as the primary heading — until
  // then the Spanish original is all there is to show.
  const hasRealTranslation = tender.title.zh !== tender.title.es;
  const qualification = preferredRequirement(tender.qualifications);
  const experience = preferredRequirement(tender.experienceRequirements);
  const document = preferredRequirement(tender.requiredDocuments);
  const risk = tender.risks.slice().sort((a, b) => RISK_PRIORITY[a.level] - RISK_PRIORITY[b.level])[0];
  const previews = [
    qualification && { label: "资质要求", text: localize(qualification.title, locale), strong: qualification.mandatory },
    experience && { label: "经验要求", text: localize(experience.title, locale), strong: experience.mandatory },
    document && { label: "所需文件", text: localize(document.title, locale), strong: document.mandatory },
    risk && { label: "风险提示", text: localize(risk.title, locale), strong: risk.level === "critical" },
  ].filter(Boolean) as { label: string; text: string; strong: boolean }[];

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

      {previews.length > 0 && (
        <div className="rounded-xl border border-[#e2e7e9] bg-[#f7f9f8] px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#73818a]">投标重点预览</p>
          <ul className="space-y-1.5">
            {previews.map((preview) => (
              <li key={preview.label} className="flex min-w-0 items-baseline gap-2 text-xs leading-5">
                <span className={`shrink-0 font-bold ${preview.strong ? "text-[#b42318]" : "text-[#586b77]"}`}>{preview.label}</span>
                <span className="truncate text-[#425461]">{preview.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
      <Link href={`/tenders/${tender.slug}`} className="relative z-10 mt-1 inline-flex w-full items-center justify-center rounded-xl bg-[#071826] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#163b52]">
        查看招标信息
      </Link>
    </article>
  );
}
