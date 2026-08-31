"use client";

import type { TenderRisk } from "@/types/tender";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { RISK_LEVEL_COLORS, RISK_LEVEL_ICONS } from "@/lib/tender-labels";

export function RiskList({ risks }: { risks: TenderRisk[] }) {
  const { locale } = useLocale();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.risks, locale)}
      </h2>
      {risks.length === 0 ? (
        <p className="text-sm text-zinc-500">{localize(uiText.noneListed, locale)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {risks.map((risk) => (
            <li
              key={risk.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start gap-2">
                <span aria-hidden className="text-lg leading-none">
                  {RISK_LEVEL_ICONS[risk.level]}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                      {localize(risk.title, locale)}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_LEVEL_COLORS[risk.level]}`}
                    >
                      {risk.level}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {localize(risk.description, locale)}
                  </p>
                  {risk.sourceReference && (
                    <p className="mt-2 text-xs text-zinc-400">
                      {localize(uiText.source, locale)}: {risk.sourceReference}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
