"use client";

import { useMemo, useState } from "react";
import type { Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { INDUSTRIES } from "@/data/tenders";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { SCOPE_TYPE_LABELS, STATUS_LABELS } from "@/lib/tender-labels";
import { filterTenders } from "@/lib/filter-tenders";
import { TenderCard } from "@/components/tenders/TenderCard";
import { MultiSelectPills } from "@/components/tenders/MultiSelectPills";

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
  const [industries, setIndustries] = useState<string[]>([]);
  const [scopeTypes, setScopeTypes] = useState<TenderScopeType[]>([]);
  const [statuses, setStatuses] = useState<TenderStatus[]>([]);

  const hasActiveFilters =
    industries.length > 0 || scopeTypes.length > 0 || statuses.length > 0 || query.length > 0;

  const results = useMemo(
    () =>
      filterTenders(tenders, { query, industries, scopeTypes, statuses }, locale),
    [tenders, query, industries, scopeTypes, statuses, locale],
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.navTenders, locale)}
      </h1>

      <div className="flex flex-col gap-4">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={localize(uiText.searchPlaceholder, locale)}
          className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
        />

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <MultiSelectPills
            label={localize(uiText.industryLabel, locale)}
            options={INDUSTRIES.map((option) => ({ value: option, label: option }))}
            selected={industries}
            onChange={setIndustries}
          />

          <MultiSelectPills
            label={localize(uiText.scopeLabel, locale)}
            options={SCOPE_TYPES.map((option) => ({
              value: option,
              label: localize(SCOPE_TYPE_LABELS[option], locale),
            }))}
            selected={scopeTypes}
            onChange={setScopeTypes}
          />

          <MultiSelectPills
            label={localize(uiText.statusLabel, locale)}
            options={STATUSES.map((option) => ({
              value: option,
              label: localize(STATUS_LABELS[option], locale),
            }))}
            selected={statuses}
            onChange={setStatuses}
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setIndustries([]);
              setScopeTypes([]);
              setStatuses([]);
            }}
            className="self-start text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            {localize(uiText.clearFilters, locale)}
          </button>
        )}
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
