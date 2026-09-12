"use client";

import type { Locale, TenderRisk, TenderRiskLevel } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { RISK_LEVEL_COLORS, RISK_LEVEL_ICONS } from "@/lib/tender-labels";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";

const RISK_LEVEL_RANK: Record<TenderRiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const COLLAPSE_AFTER = 6;

function bySeverity(a: TenderRisk, b: TenderRisk): number {
  return RISK_LEVEL_RANK[a.level] - RISK_LEVEL_RANK[b.level];
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-none stroke-current transition-transform group-open:rotate-180">
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RiskItem({ risk, locale }: { risk: TenderRisk; locale: Locale }) {
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">
          {RISK_LEVEL_ICONS[risk.level]}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black leading-5 text-[#071826] sm:text-base">{localize(risk.title, locale)}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_LEVEL_COLORS[risk.level]}`}>{risk.level}</span>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-[#52636e]">{localize(risk.description, locale)}</p>
          {risk.sourceReference && (
            <p className="mt-2 text-xs text-[#849098]">
              {localize(uiText.source, locale)}: {risk.sourceReference}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function RiskList({ risks }: { risks: TenderRisk[] }) {
  const { locale } = useLocale();
  const highRisks = risks.filter((risk) => risk.level === "critical" || risk.level === "high").sort(bySeverity);
  const lowerRisks = risks.filter((risk) => risk.level === "medium" || risk.level === "low").sort(bySeverity);
  const visibleHighRisks = highRisks.slice(0, COLLAPSE_AFTER);
  const hiddenHighRisks = highRisks.slice(COLLAPSE_AFTER);

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading
        title={localize(uiText.risks, locale)}
        description="优先核对可能导致失格、成本增加或履约困难的事项"
        count={risks.length}
      />
      {risks.length === 0 ? (
        <p className="text-sm text-[#64717c]">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <>
          {highRisks.length > 0 && (
            <ul className="divide-y divide-[#e5e9eb] overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
              {visibleHighRisks.map((risk) => (
                <RiskItem key={risk.id} risk={risk} locale={locale} />
              ))}
            </ul>
          )}
          {hiddenHighRisks.length > 0 && (
            <details className="group rounded-xl border border-[#dbe2e5] bg-[#fffdf9]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-[#425461] hover:bg-[#f2f4f3] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2"><ChevronIcon />展开其余 {hiddenHighRisks.length} 项高优先级风险</span>
                <span className="text-xs font-semibold text-[#87939a]">完整查看</span>
              </summary>
              <ul className="divide-y divide-[#e5e9eb] border-t border-[#e5e9eb]">
                {hiddenHighRisks.map((risk) => <RiskItem key={risk.id} risk={risk} locale={locale} />)}
              </ul>
            </details>
          )}
          {lowerRisks.length > 0 && (
            <details className="group" open={highRisks.length === 0}>
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-[#52636e] hover:text-[#071826] [&::-webkit-details-marker]:hidden">
                <ChevronIcon />
                其他 {lowerRisks.length} 项中低风险提示
              </summary>
              <ul className="mt-3 divide-y divide-[#e5e9eb] overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
                {lowerRisks.map((risk) => (
                  <RiskItem key={risk.id} risk={risk} locale={locale} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
