"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { ALL_INDUSTRIES } from "@/lib/industry";
import { localize, uiText, useLocale } from "@/lib/i18n";
import {
  ALL_COUNTRIES,
  COUNTRY_LABELS,
  INDUSTRY_LABELS,
  RELEVANCE_TIER_LABELS,
  SCOPE_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/tender-labels";
import { filterTenders, isSortKey, sortTenders, type SortKey } from "@/lib/filter-tenders";
import { TenderCard } from "@/components/tenders/TenderCard";
import { MultiSelectPills } from "@/components/tenders/MultiSelectPills";
import { SaveSearchControl } from "@/components/tenders/SaveSearchControl";

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

// "awarded"/"cancelled" hidden from the default view per the user's
// explicit request (2026-09-02): a tender that's already been awarded to
// someone else (or cancelled) isn't a live bid opportunity — showing it
// mixed in with genuinely open tenders contradicts the platform's whole
// purpose. Real awarded-contract data (Ecopetrol contracts, Compras MX
// contracts, etc.) stays in the database for market-intelligence/value-
// calibration use — same "kept but not shown by default" treatment as
// "excluded" relevance and "standard" tier — and a user doing competitor/
// pricing research can still check these two pills to bring them back.
const DEFAULT_STATUSES: TenderStatus[] = ["planned", "open", "clarification", "submission_closed"];

// "excluded" isn't offered here — routine-service tenders stay hidden by
// default (see includeExcluded in lib/filter-tenders.ts); no UI control
// exposes showing them right now.
const RELEVANCE_TIERS: TenderRelevanceTier[] = ["flagship", "significant", "standard"];

// "standard" tenders are hidden from the default view per the user's
// explicit request (2026-09-02): "也不要常规规模项目" — a 2026-09-02
// export showed "standard" was 60-75% of the kept feed even after the
// value/keyword tightening pass, so it's excluded from the default tier
// set the same way "excluded" already is, while staying a normal,
// selectable pill (unlike "excluded") for anyone who wants to browse it.
const DEFAULT_RELEVANCE_TIERS: TenderRelevanceTier[] = ["flagship", "significant"];

const PAGE_SIZE = 28;

function parseList(param: string | null): string[] {
  return param ? param.split(",").filter(Boolean) : [];
}

export function TenderExplorer({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const industries = parseList(searchParams.get("industry"));
  const industryMatchMode = searchParams.get("industryMode") === "all" ? "all" : "any";
  const scopeTypes = parseList(searchParams.get("scope")) as TenderScopeType[];
  const statusParam = searchParams.get("status");
  const statuses = (
    statusParam !== null ? parseList(statusParam) : DEFAULT_STATUSES
  ) as TenderStatus[];
  const countries = parseList(searchParams.get("country"));
  const tierParam = searchParams.get("tier");
  const relevanceTiers = (
    tierParam !== null ? parseList(tierParam) : DEFAULT_RELEVANCE_TIERS
  ) as TenderRelevanceTier[];
  const sortParam = searchParams.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "publication_desc";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const hasActiveFilters =
    industries.length > 0 ||
    scopeTypes.length > 0 ||
    statusParam !== null ||
    countries.length > 0 ||
    tierParam !== null ||
    query.length > 0;

  function updateParams(updates: Record<string, string | null>, resetPage = true) {
    // Reads the live URL rather than the `searchParams` snapshot from this render: router.replace()
    // updates window.location synchronously but the searchParams hook only catches up on the next
    // render, so two updates fired in quick succession (e.g. a filter click immediately followed by
    // a sort change) would otherwise race and the second call would silently drop the first's change.
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  const filtered = useMemo(
    () =>
      filterTenders(
        tenders,
        { query, industries, industryMatchMode, scopeTypes, statuses, countries, relevanceTiers },
        locale,
      ),
    [tenders, query, industries, industryMatchMode, scopeTypes, statuses, countries, relevanceTiers, locale],
  );

  const sorted = useMemo(() => sortTenders(filtered, sort), [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const currentSearchHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.navTenders, locale)}
      </h1>

      <input
        type="search"
        value={query}
        onChange={(event) => updateParams({ q: event.target.value })}
        placeholder={localize(uiText.searchPlaceholder, locale)}
        className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          <MultiSelectPills
            label={localize(uiText.scaleLabel, locale)}
            options={RELEVANCE_TIERS.map((option) => ({
              value: option,
              label: localize(RELEVANCE_TIER_LABELS[option], locale),
            }))}
            selected={relevanceTiers}
            onChange={(next) => updateParams({ tier: next.join(",") || null })}
          />

          <div className="flex flex-col gap-1">
            <MultiSelectPills
              label={localize(uiText.industryLabel, locale)}
              options={ALL_INDUSTRIES.map((option) => ({
                value: option,
                label: localize(INDUSTRY_LABELS[option], locale),
              }))}
              selected={industries}
              onChange={(next) => updateParams({ industry: next.join(",") || null })}
            />
            {industries.length > 1 && (
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={industryMatchMode === "all"}
                  onChange={(event) =>
                    updateParams({ industryMode: event.target.checked ? "all" : null })
                  }
                  className="h-3 w-3"
                />
                {localize(uiText.industryMatchAll, locale)}
              </label>
            )}
          </div>

          <MultiSelectPills
            label={localize(uiText.scopeLabel, locale)}
            options={SCOPE_TYPES.map((option) => ({
              value: option,
              label: localize(SCOPE_TYPE_LABELS[option], locale),
            }))}
            selected={scopeTypes}
            onChange={(next) => updateParams({ scope: next.join(",") || null })}
          />

          <MultiSelectPills
            label={localize(uiText.statusLabel, locale)}
            options={STATUSES.map((option) => ({
              value: option,
              label: localize(STATUS_LABELS[option], locale),
            }))}
            selected={statuses}
            onChange={(next) => updateParams({ status: next.join(",") || null })}
          />

          <MultiSelectPills
            label={localize(uiText.countryLabel, locale)}
            options={ALL_COUNTRIES.map((option) => ({
              value: option,
              label: localize(COUNTRY_LABELS[option], locale),
            }))}
            selected={countries}
            onChange={(next) => updateParams({ country: next.join(",") || null })}
          />

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">
              {localize(uiText.sortLabel, locale)}
            </span>
            <select
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value })}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="publication_desc">{localize(uiText.sortPublicationDesc, locale)}</option>
              <option value="deadline_asc">{localize(uiText.sortDeadlineAsc, locale)}</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => router.replace(pathname, { scroll: false })}
              className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              {localize(uiText.clearFilters, locale)}
            </button>
          )}
          {hasActiveFilters && <SaveSearchControl href={currentSearchHref} />}
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        {sorted.length} {localize(uiText.resultsCount, locale)}
      </p>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {localize(uiText.noResults, locale)}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginated.map((tender) => (
              <TenderCard key={tender.id} tender={tender} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => updateParams({ page: String(currentPage - 1) }, false)}
                disabled={currentPage <= 1}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-400"
              >
                {localize(uiText.previousPage, locale)}
              </button>
              <span className="text-xs text-zinc-500">
                {localize(uiText.pageOf, locale)
                  .replace("{page}", String(currentPage))
                  .replace("{total}", String(totalPages))}
              </span>
              <button
                type="button"
                onClick={() => updateParams({ page: String(currentPage + 1) }, false)}
                disabled={currentPage >= totalPages}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-400"
              >
                {localize(uiText.nextPage, locale)}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
