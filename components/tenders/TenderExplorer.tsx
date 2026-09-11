"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { VISIBLE_TENDER_STATUSES } from "@/lib/tender-status";
import { ALL_INDUSTRIES, type IndustryKey } from "@/lib/industry";
import { formatDate, formatEstimatedValueUsdMillions } from "@/lib/format";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { ALL_SCOPE_TYPES, COUNTRY_LABELS, INDUSTRY_LABELS, RELEVANCE_TIER_LABELS, SCOPE_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS, countryLabel, industryLabel } from "@/lib/tender-labels";
import { isSortKey, type SortKey } from "@/lib/filter-tenders";
import { useSavedTenderIds } from "@/lib/saved";
import { MultiSelectPills } from "@/components/tenders/MultiSelectPills";
import { InlineTogglePills } from "@/components/tenders/InlineTogglePills";
import { SaveSearchControl } from "@/components/tenders/SaveSearchControl";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";
import { ColombiaFlag, CountryFlag, MexicoFlag } from "@/components/tenders/CountryFlag";
import { PageIntro } from "@/components/layout/PageIntro";
import { trackAnalyticsEvent } from "@/lib/analytics-client";
import { canInteractWithTenderList, type AccessPromptKind, type ViewerRole } from "@/lib/access-control";
import { AccessPrompt } from "@/components/access/AccessPrompt";
import { DEFAULT_TENDER_LIST_STATUSES, type TenderListItem } from "@/lib/tender-list-page";

// "planned"/计划中 is deliberately absent — see lib/tender-status.ts.
const STATUSES: TenderStatus[] = VISIBLE_TENDER_STATUSES;
// Closed and cancelled projects stay available through an explicit filter,
// but do not crowd the initial discovery view. Awarded projects remain in
// the default set (the public DB layer already requires them to have analysis).
const DEFAULT_STATUSES: TenderStatus[] = DEFAULT_TENDER_LIST_STATUSES;
// "excluded" isn't offered here — routine-service tenders stay hidden by
// default (see includeExcluded in lib/filter-tenders.ts); no UI control
// exposes showing them. "standard" IS offered (unlike "excluded") since
// it's a normal, selectable tier, on by default same as flagship/significant.
const RELEVANCE_TIERS: TenderRelevanceTier[] = ["flagship", "significant", "standard"];
const DEFAULT_RELEVANCE_TIERS: TenderRelevanceTier[] = [];
const AVAILABLE_COUNTRIES = ["Mexico", "Colombia"] as const;

function formatTenderCount(value: number): string {
  if (value < 1000) return value.toLocaleString();
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
}

function parseList(param: string | null): string[] {
  return param ? param.split(",").filter(Boolean) : [];
}

/** First page, last page, and a small window around the current page — with "ellipsis" markers for any gap — so a jump to page 12 of 40 doesn't require 11 clicks on "下一页". */
function buildPageWindow(current: number, total: number): (number | "ellipsis")[] {
  const radius = 1;
  const pages = new Set<number>([1, total, current]);
  for (let i = current - radius; i <= current + radius; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(sorted[i]);
  }
  return result;
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-none stroke-current stroke-1.8">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" strokeLinecap="round" />
    </svg>
  );
}

function TenderSearchForm({
  initialQuery,
  hasActiveFilters,
  currentSearchHref,
  onSearch,
}: {
  initialQuery: string;
  hasActiveFilters: boolean;
  currentSearchHref: string;
  onSearch: (query: string) => void;
}) {
  const [draftQuery, setDraftQuery] = useState(initialQuery);

  return (
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => {
      event.preventDefault();
      onSearch(draftQuery.trim());
    }}>
      <label className="relative flex-1">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#6e7d86]"><SearchIcon /></span>
        <input
          type="search"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="搜索项目名称、摘要、编号或发布机构"
          className="h-11 w-full rounded-xl border border-[#d8e0e3] bg-white pl-12 pr-4 text-sm placeholder:text-[#919ca2] focus:border-[#ffb21c] focus:outline-none"
        />
      </label>
      <div className="flex gap-3">
        <button type="submit" className="h-11 flex-1 rounded-xl bg-[#ffb21c] px-7 text-sm font-black text-[#071826] hover:bg-[#ffc247] sm:flex-none">搜索</button>
        <SaveSearchControl href={currentSearchHref} disabled={!hasActiveFilters} />
      </div>
    </form>
  );
}

function TenderRow({ tender }: { tender: TenderListItem }) {
  const { locale } = useLocale();
  const hasRealTranslation = tender.title.zh !== tender.title.es;
  const value = tender.estimatedValue !== undefined ? formatEstimatedValueUsdMillions(tender.estimatedValue, tender.currency, locale) : null;

  return (
    <article className="group relative grid gap-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 transition-all hover:border-[#a9b8bf] hover:shadow-[0_18px_45px_-35px_rgba(6,27,43,.5)] md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
      <div className="min-w-0">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {tender.industries.map((industry) => (
            <span key={industry} className="rounded-full bg-[#edf2f3] px-2.5 py-1 text-[11px] font-semibold text-[#24465a]">
              {industryLabel(industry, locale)}
            </span>
          ))}
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_COLORS[tender.status]}`}>
            {localize(STATUS_LABELS[tender.status], locale)}
          </span>
        </div>
        <h2 className="text-base font-black leading-6 text-black sm:text-lg">
          <Link href={`/tenders/${tender.slug}`} className="after:absolute after:inset-0">
            {hasRealTranslation ? tender.title.zh : tender.title.es}
          </Link>
        </h2>
        {hasRealTranslation && <p className="mt-1 truncate text-xs text-[#75838c]">{tender.title.es}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[#52636e]">
          <span className="inline-flex items-center gap-1.5"><CountryFlag country={tender.country} />{countryLabel(tender.country, locale)}</span>
          <span className="truncate">发布机构：{tender.buyer}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-[#e5e9eb] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <div>
          <p className="text-xs font-semibold text-[#7a878f]">项目金额</p>
          <p className={`mt-1 text-lg font-black ${value ? "text-[#b86e00]" : "text-[#9aa5ab]"}`}>{value ?? "未公开"}</p>
          <p className="mt-3 text-xs font-semibold text-[#7a878f]">计划交标</p>
          <p className="mt-1 text-sm font-bold text-[#071826]">
            {tender.submissionDeadline ? formatDate(tender.submissionDeadline, locale) : "待公布"}
          </p>
        </div>
        <SaveTenderButton tenderId={tender.id} className="relative z-10 shrink-0" />
      </div>
    </article>
  );
}

function SavedTenderReminders({ savedIds }: { savedIds: string[] }) {
  const { locale } = useLocale();
  const [reminders, setReminders] = useState<TenderListItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const request = savedIds.length === 0
      ? Promise.resolve([] as TenderListItem[])
      : fetch(`/api/tenders/saved-reminders?ids=${encodeURIComponent(savedIds.join(","))}`, {
          signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error("Failed to load saved tender reminders");
          return response.json() as Promise<TenderListItem[]>;
        });

    request.then(setReminders).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
    });
    return () => controller.abort();
  }, [savedIds]);

  if (reminders.length === 0) {
    return <p className="mt-4 text-sm text-[#64717c]">待收藏项目特别提醒——点击项目上的收藏图标后，交标提醒会显示在这里。</p>;
  }

  return (
    <div className="mt-4 divide-y divide-[#e5e9eb]">
      {reminders.map((tender) => (
        <Link key={tender.id} href={`/tenders/${tender.slug}`} className="block py-3 first:pt-0 last:pb-0">
          <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#64717c]"><CountryFlag country={tender.country} />{countryLabel(tender.country, locale)}</span>
          <p className="line-clamp-2 text-sm font-bold leading-5 text-[#172c3b]">{tender.title.zh || tender.title.es}</p>
          <p className="mt-1.5 text-xs font-semibold text-[#b86e00]">{formatDate(tender.submissionDeadline!, locale)}</p>
        </Link>
      ))}
    </div>
  );
}

export function TenderExplorer({
  tenders,
  viewerRole,
  totalResults,
  totalPages,
  currentPage,
  availableIndustries,
  availableScopeTypes,
  siteTenderCount,
  newTodayCount,
  upcomingCount,
}: {
  tenders: TenderListItem[];
  viewerRole: ViewerRole;
  totalResults: number;
  totalPages: number;
  currentPage: number;
  availableIndustries: IndustryKey[];
  availableScopeTypes: TenderScopeType[];
  siteTenderCount: number;
  newTodayCount: number;
  upcomingCount: number;
}) {
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { savedIds } = useSavedTenderIds();
  const [accessPrompt, setAccessPrompt] = useState<AccessPromptKind | null>(null);

  // Falls back to the full taxonomy only if the data carries no industries
  // at all — an empty filter would be worse than an over-broad one.
  const industryOptions = availableIndustries.length > 0 ? availableIndustries : ALL_INDUSTRIES;
  // Same fallback rule as industries: offer everything only when the data
  // carries nothing, since an empty filter is worse than an over-broad one.
  const scopeTypeOptions = availableScopeTypes.length > 0 ? availableScopeTypes : ALL_SCOPE_TYPES;

  const query = searchParams.get("q") ?? "";
  const countryParam = searchParams.get("country");
  const countries = useMemo(
    () => countryParam ? parseList(countryParam) : [...AVAILABLE_COUNTRIES],
    [countryParam],
  );
  const industries = parseList(searchParams.get("industry"));
  const industryMatchMode = searchParams.get("industryMode") === "all" ? "all" : "any";
  const scopeTypes = parseList(searchParams.get("scope")) as TenderScopeType[];
  // "none" is a distinct sentinel from an absent param: absent means "use
  // the app's default preset" (DEFAULT_STATUSES/DEFAULT_RELEVANCE_TIERS
  // below); "none" means the user explicitly cleared every chip in that
  // group via the "全部" quick-clear button (see InlineTogglePills) and
  // wants NO restriction on this dimension — a plain empty comma-list
  // can't represent that distinction on its own, since joining an empty
  // array back to "" is indistinguishable from "param was never set".
  const statusParam = searchParams.get("status");
  // Memoized so an empty-array branch (statusParam === "none") doesn't get
  // a fresh [] reference on every render — filterTenders' own useMemo
  // below depends on this array's identity, not just its contents.
  const statuses = useMemo<TenderStatus[]>(
    () => (statusParam === "none" ? [] : statusParam !== null ? (parseList(statusParam) as TenderStatus[]) : DEFAULT_STATUSES),
    [statusParam],
  );
  const tierParam = searchParams.get("tier");
  const relevanceTiers = useMemo<TenderRelevanceTier[]>(
    () => (tierParam === "none" ? [] : tierParam !== null ? (parseList(tierParam) as TenderRelevanceTier[]) : DEFAULT_RELEVANCE_TIERS),
    [tierParam],
  );
  const sortParam = searchParams.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "deadline_asc";
  const viewParam = searchParams.get("view");
  const view = viewParam === "new" || viewParam === "deadline" ? viewParam : null;

  const hasActiveFilters = countryParam !== null || industries.length > 0 || scopeTypes.length > 0 || statusParam !== null || tierParam !== null || sortParam !== null || query.length > 0 || view !== null;

  function updateParams(updates: Record<string, string | null>, resetPage = true) {
    for (const [dimension, value] of Object.entries(updates)) {
      if (!value || dimension === "q" || dimension === "page" || dimension === "industryMode") continue;
      trackAnalyticsEvent("filter_apply", {
        properties: {
          dimension,
          values: value === "none" ? ["全部"] : value.split(","),
        },
      });
    }
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  const currentSearchHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  function promptForInteraction(target: EventTarget | null): AccessPromptKind | null {
    if (!(target instanceof Element)) return null;
    const interactive = target.closest("a, button, input, select, textarea, label, [role='button'], [role='switch']");
    if (!interactive) return null;

    // Guests may inspect the initial list, but every list-page interaction is
    // a member feature, including opening a project that happens to be free
    // from the homepage entry point.
    if (viewerRole === "guest") return "login";

    // An expired trial gets the same read-only initial list as a visitor,
    // but every attempted action leads to subscription rather than login.
    if (viewerRole === "free") return "subscription";

    return null;
  }

  function stopLockedInteraction(event: {
    target: EventTarget | null;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    const kind = promptForInteraction(event.target);
    if (!kind) return;
    event.preventDefault();
    event.stopPropagation();
    setAccessPrompt(kind);
  }

  const accessNotice = viewerRole === "guest"
    ? "当前可预览项目清单；登录后即可使用搜索、筛选、翻页、收藏和查看项目。"
    : viewerRole === "free"
      ? "您的 3 天免费试用已结束；当前可预览项目清单，订阅后即可使用搜索、筛选、翻页、收藏和查看项目。"
      : null;

  const listIsLocked = !canInteractWithTenderList(viewerRole);

  return (
    <>
    <div
      className={`space-y-5 ${listIsLocked ? "[&_a]:cursor-not-allowed [&_button]:cursor-not-allowed [&_input]:cursor-not-allowed" : ""}`}
      onPointerDownCapture={(event) => {
        if (promptForInteraction(event.target)) event.preventDefault();
      }}
      onClickCapture={stopLockedInteraction}
      onSubmitCapture={stopLockedInteraction}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") stopLockedInteraction(event);
      }}
    >
      <PageIntro
        eyebrow="Tender database"
        title="招标项目"
        description="筛选并评估适合中国企业的拉美政府采购机会"
        metrics={[{ label: "当前结果", value: totalResults.toLocaleString(), suffix: "个项目" }]}
      />

      {accessNotice && (
        <button type="button" onClick={() => setAccessPrompt(viewerRole === "guest" ? "login" : "subscription")} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#f0ce79] bg-[#fff7df] px-4 py-3 text-left text-sm font-bold text-[#805100] sm:px-5">
          <span className="flex items-center gap-3"><span aria-hidden="true">🔒</span>{accessNotice}</span>
          <span className="shrink-0 underline underline-offset-4">了解权限</span>
        </button>
      )}

      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
        <TenderSearchForm
          key={query}
          initialQuery={query}
          hasActiveFilters={hasActiveFilters}
          currentSearchHref={currentSearchHref}
          onSearch={(nextQuery) => {
            if (nextQuery) {
              trackAnalyticsEvent("filter_apply", { properties: { dimension: "search", values: ["使用搜索"] } });
            }
            if (nextQuery !== query) updateParams({ q: nextQuery || null });
          }}
        />

        <div className="mt-4 grid gap-y-3 xl:grid-cols-[max-content_max-content_max-content] xl:divide-x xl:divide-[#dbe2e5]">
          <div className="xl:pr-5">
            <MultiSelectPills
              label="国家/地区"
              options={AVAILABLE_COUNTRIES.map((country) => ({
                value: country,
                label: localize(COUNTRY_LABELS[country], locale),
                icon: country === "Mexico" ? <MexicoFlag /> : <ColombiaFlag />,
              }))}
              selected={countries as (typeof AVAILABLE_COUNTRIES)[number][]}
              onChange={(next) => updateParams({ country: next.length === 1 ? next[0] : null })}
            />
          </div>
          <div className="xl:px-5">
            <MultiSelectPills
              label="行业"
              searchable
              options={industryOptions.map((option) => ({ value: option, label: localize(INDUSTRY_LABELS[option], locale) }))}
              selected={industries}
              onChange={(next) => updateParams({ industry: next.join(",") || null })}
            />
          </div>
          <div className="xl:pl-5">
            <MultiSelectPills
              label="项目类型"
              options={scopeTypeOptions.map((option) => ({ value: option, label: localize(SCOPE_TYPE_LABELS[option], locale) }))}
              selected={scopeTypes}
              onChange={(next) => updateParams({ scope: next.join(",") || null })}
            />
          </div>
        </div>

        {/* Short, fixed-length option lists stay always-visible instead of
            behind a dropdown — see InlineTogglePills' header comment. All
            three groups share one wrapping row (compressed per explicit
            user request 2026-09-04) rather than a row each. */}
        <div className="mt-4 grid gap-y-3 border-t border-[#e5e9eb] pt-4 xl:grid-cols-[max-content_max-content_max-content] xl:divide-x xl:divide-[#dbe2e5]">
          <div className="xl:pr-5">
            <InlineTogglePills
              label={localize(uiText.scaleLabel, locale)}
              options={RELEVANCE_TIERS.map((option) => ({ value: option, label: localize(RELEVANCE_TIER_LABELS[option], locale) }))}
              selected={relevanceTiers}
              showAllOption
              onChange={(next) => updateParams({ tier: next.length === 0 ? "none" : next.join(",") })}
            />
          </div>
          <div className="xl:px-5">
            <InlineTogglePills
              label="项目阶段"
              options={STATUSES.map((option) => ({ value: option, label: localize(STATUS_LABELS[option], locale) }))}
              selected={statuses}
              showAllOption
              onChange={(next) => updateParams({ status: next.length === 0 ? "none" : next.join(",") })}
            />
          </div>
          <div className="xl:pl-5">
            <InlineTogglePills
              label="计划交标"
              mode="single"
              options={[
                { value: "deadline_asc" as const, label: "由近到远" },
                { value: "publication_desc" as const, label: "最新发布" },
              ]}
              selected={[sort]}
              onChange={(next) => updateParams({ sort: next[0] ?? null })}
            />
          </div>
        </div>

        {hasActiveFilters && <div className="mt-3 flex flex-wrap items-center gap-3">
          {industries.map((industry) => (
            <button key={industry} type="button" onClick={() => updateParams({ industry: industries.filter((item) => item !== industry).join(",") || null })} className="rounded-full bg-[#e9eef0] px-3 py-1 text-xs font-semibold text-[#314b5c]">
              {industryLabel(industry, locale)} ×
            </button>
          ))}
          {industries.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-[#5d6d77]">
              <input type="checkbox" checked={industryMatchMode === "all"} onChange={(event) => updateParams({ industryMode: event.target.checked ? "all" : null })} />
              同时包含全部所选行业
            </label>
          )}
          {hasActiveFilters && (
            <button type="button" onClick={() => router.replace(pathname, { scroll: false })} className="text-xs font-semibold text-[#64717c] underline underline-offset-4 hover:text-[#071826]">
              {localize(uiText.clearFilters, locale)}
            </button>
          )}
        </div>}
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {tenders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#bdc8cd] bg-[#fffdf9] p-10 text-center text-sm text-[#64717c]">{localize(uiText.noResults, locale)}</p>
          ) : (
            <div className="space-y-3">
              {tenders.map((tender) => <TenderRow key={tender.id} tender={tender} />)}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => updateParams({ page: String(currentPage - 1) }, false)} disabled={currentPage <= 1} className="rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-semibold disabled:opacity-40">上一页</button>
              {buildPageWindow(currentPage, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-xs text-[#9aa5ab]">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => updateParams({ page: String(p) }, false)}
                    className={`min-w-9 rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                      p === currentPage ? "bg-[#ffb21c] text-[#071826]" : "border border-[#d8e0e3] bg-white text-[#425461] hover:border-[#ffb21c]"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button type="button" onClick={() => updateParams({ page: String(currentPage + 1) }, false)} disabled={currentPage >= totalPages} className="rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-semibold disabled:opacity-40">下一页</button>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl bg-[#061b2b] p-5 text-white">
            <h2 className="text-base font-bold">招标概览</h2>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/20 text-center">
              <div className="px-1 py-1.5"><p className="text-[11px] font-medium text-white/58">全站项目</p><p className="mt-1.5 text-[1.65rem] font-black leading-none">{formatTenderCount(siteTenderCount)}</p></div>
              <button
                type="button"
                onClick={() => updateParams({ view: view === "new" ? null : "new", sort: view === "new" ? null : "publication_desc" })}
                className={`rounded-lg px-1 py-1.5 transition-colors ${view === "new" ? "bg-white/15" : "hover:bg-white/10"}`}
              >
                <p className="text-[11px] font-medium text-white/58">本日新增</p>
                <p className="mt-1.5 text-[1.65rem] font-black leading-none text-[#ffb21c]">{newTodayCount}</p>
              </button>
              <button
                type="button"
                onClick={() => updateParams({ view: view === "deadline" ? null : "deadline", sort: view === "deadline" ? null : "deadline_asc" })}
                className={`rounded-lg px-1 py-1.5 transition-colors ${view === "deadline" ? "bg-white/15" : "hover:bg-white/10"}`}
              >
                <p className="text-[11px] font-medium text-white/58">即将交标</p>
                <p className="mt-1.5 text-[1.65rem] font-black leading-none text-[#ffb21c]">{upcomingCount}</p>
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold text-[#071826]">交标提醒</h2><Link href="/saved" className="text-xs font-semibold text-[#24465a]">查看关注</Link></div>
            <SavedTenderReminders savedIds={savedIds} />
          </section>
        </aside>
      </div>
    </div>
    <AccessPrompt
      open={accessPrompt !== null}
      kind={accessPrompt ?? "login"}
      nextPath={currentSearchHref}
      onClose={() => setAccessPrompt(null)}
    />
    </>
  );
}
