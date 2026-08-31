"use client";

import { useMemo, useState } from "react";
import type { Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { INDUSTRIES } from "@/data/tenders";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { SCOPE_TYPE_LABELS, STATUS_LABELS } from "@/lib/tender-labels";
import { filterTenders } from "@/lib/tenders";
import { TenderCard } from "@/components/tenders/TenderCard";

const SCOPE_TYPES: TenderScopeType[] = [
  "equipment",
  "services",
  "equipment_services",
  "works",
  "consulting",
];

const STATUSES: TenderStatus[] = [
  "planned",
  "open",
  "clarification",
  "submission_closed",
  "awarded",
  "cancelled",
];

export function TenderExplorer({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [scopeType, setScopeType] = useState<TenderScopeType | "">("");
  const [status, setStatus] = useState<TenderStatus | "">("");

  const results = useMemo(
    () =>
      filterTenders(
        tenders,
        {
          query,
          industry: industry || undefined,
          scopeType: scopeType || undefined,
          status: status || undefined,
        },
        locale,
      ),
    [tenders, query, industry, scopeType, status, locale],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={localize(uiText.searchPlaceholder, locale)}
          className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
        />

        <div className="flex flex-wrap gap-3">
          <select
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">{localize(uiText.allIndustries, locale)}</option>
            {INDUSTRIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={scopeType}
            onChange={(event) =>
              setScopeType(event.target.value as TenderScopeType | "")
            }
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">{localize(uiText.allScopes, locale)}</option>
            {SCOPE_TYPES.map((option) => (
              <option key={option} value={option}>
                {localize(SCOPE_TYPE_LABELS[option], locale)}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as TenderStatus | "")
            }
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">{localize(uiText.allStatuses, locale)}</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {localize(STATUS_LABELS[option], locale)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        {results.length} {localize(uiText.resultsCount, locale)}
      </p>

      {results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {localize(uiText.noResults, locale)}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((tender) => (
            <TenderCard key={tender.id} tender={tender} />
          ))}
        </div>
      )}
    </div>
  );
}
