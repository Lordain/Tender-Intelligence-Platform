"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { ALL_INDUSTRIES } from "@/lib/industry";
import { formatDate, formatEstimatedValueUsdMillions } from "@/lib/format";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { COUNTRY_LABELS, INDUSTRY_LABELS, RELEVANCE_TIER_LABELS, SCOPE_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS, countryLabel, industryLabel } from "@/lib/tender-labels";
import { filterTenders, isSortKey, sortTenders, type SortKey } from "@/lib/filter-tenders";
import { useSavedTenderIds } from "@/lib/saved";
import { MultiSelectPills } from "@/components/tenders/MultiSelectPills";
import { InlineTogglePills } from "@/components/tenders/InlineTogglePills";
import { SaveSearchControl } from "@/components/tenders/SaveSearchControl";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";
import { ColombiaFlag, CountryFlag, MexicoFlag } from "@/components/tenders/CountryFlag";
import { PageIntro } from "@/components/layout/PageIntro";

const SCOPE_TYPES: TenderScopeType[] = ["equipment", "services", "equipment_services", "works", "consulting"];
const STATUSES: TenderStatus[] = ["planned", "open", "clarification", "submission_closed", "awarded", "cancelled"];
const DEFAULT_STATUSES: TenderStatus[] = ["planned", "open", "clarification", "submission_closed"];
// "excluded" isn't offered here — routine-service tenders stay hidden by
// default (see includeExcluded in lib/filter-tenders.ts); no UI control
// exposes showing them. "standard" IS offered (unlike "excluded") since
// it's a normal, selectable tier — just off by default per
// DEFAULT_RELEVANCE_TIERS below — this control has to exist or a
// document-analyzed "standard"-tier tender is permanently invisible with
// no way to widen the filter from the UI.
const RELEVANCE_TIERS: TenderRelevanceTier[] = ["flagship", "significant", "standard"];
const DEFAULT_RELEVANCE_TIERS: TenderRelevanceTier[] = ["flagship", "significant"];
const AVAILABLE_COUNTRIES = ["Mexico", "Colombia"] as const;
const PAGE_SIZE = 28;

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

function TenderRow({ tender }: { tender: Tender }) {
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
          <span>项目编号：{tender.tenderNumber}</span>
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

export function TenderExplorer({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { savedIds } = useSavedTenderIds();

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
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const viewParam = searchParams.get("view");
  const view = viewParam === "new" || viewParam === "deadline" ? viewParam : null;

  const hasActiveFilters = countryParam !== null || industries.length > 0 || scopeTypes.length > 0 || statusParam !== null || tierParam !== null || sortParam !== null || query.length > 0 || view !== null;

  function updateParams(updates: Record<string, string | null>, resetPage = true) {
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
    () => filterTenders(tenders, { query, industries, industryMatchMode, scopeTypes, statuses, countries, relevanceTiers }, locale),
    [tenders, query, industries, industryMatchMode, scopeTypes, statuses, countries, relevanceTiers, locale],
  );
  // Stat-card counts are derived from `filtered` (every active filter EXCEPT
  // `view`), not `sorted` — so the "本周新增"/"即将交标" numbers stay stable
  // no matter which of the two views is currently active; only the list
  // below narrows when a view is clicked.
  const newThisWeekCount = useMemo(() => {
    const cutoff = new Date().getTime() - 7 * 24 * 60 * 60 * 1000;
    return filtered.filter((tender) => new Date(tender.createdAt).getTime() >= cutoff).length;
  }, [filtered]);
  const upcomingCount = useMemo(() => {
    const now = new Date().getTime();
    return filtered.filter((tender) => tender.submissionDeadline && new Date(tender.submissionDeadline).getTime() >= now).length;
  }, [filtered]);
  const viewFiltered = useMemo(() => {
    if (view === "new") {
      const cutoff = new Date().getTime() - 7 * 24 * 60 * 60 * 1000;
      return filtered.filter((tender) => new Date(tender.createdAt).getTime() >= cutoff);
    }
    if (view === "deadline") {
      const now = new Date().getTime();
      return filtered.filter((tender) => tender.submissionDeadline && new Date(tender.submissionDeadline).getTime() >= now);
    }
    return filtered;
  }, [filtered, view]);
  const sorted = useMemo(() => sortTenders(viewFiltered, sort), [viewFiltered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // "交标提醒" is specifically about tenders the user has bookmarked (查看
  // 关注/收藏), not just whatever the current search happens to surface —
  // per explicit user request (2026-09-04). Derived from the full
  // `tenders` prop (not `sorted`) so it stays stable regardless of the
  // active filters/search.
  const savedReminders = useMemo(
    () =>
      tenders
        .filter((tender) => savedIds.includes(tender.id) && tender.submissionDeadline)
        .sort((a, b) => a.submissionDeadline!.localeCompare(b.submissionDeadline!))
        .slice(0, 6),
    [tenders, savedIds],
  );
  const currentSearchHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Tender database"
        title="招标项目"
        description="筛选并评估适合中国企业的拉美政府采购机会"
        tags={["墨西哥 · 哥伦比亚", "重点行业", "持续更新"]}
        metrics={[{ label: "当前结果", value: sorted.length.toLocaleString(), suffix: "个项目" }]}
      />

      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => event.preventDefault()}>
          <label className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#6e7d86]"><SearchIcon /></span>
            <input
              type="search"
              value={query}
              onChange={(event) => updateParams({ q: event.target.value })}
              placeholder="搜索项目名称、编号或发布机构"
              className="h-11 w-full rounded-xl border border-[#d8e0e3] bg-white pl-12 pr-4 text-sm placeholder:text-[#919ca2] focus:border-[#ffb21c] focus:outline-none"
            />
          </label>
          <div className="flex gap-3">
            <button type="submit" className="h-11 flex-1 rounded-xl bg-[#ffb21c] px-7 text-sm font-black text-[#071826] hover:bg-[#ffc247] sm:flex-none">搜索</button>
            <SaveSearchControl href={currentSearchHref} disabled={!hasActiveFilters} />
          </div>
        </form>

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
              options={ALL_INDUSTRIES.map((option) => ({ value: option, label: localize(INDUSTRY_LABELS[option], locale) }))}
              selected={industries}
              onChange={(next) => updateParams({ industry: next.join(",") || null })}
            />
          </div>
          <div className="xl:pl-5">
            <MultiSelectPills
              label="项目类型"
              options={SCOPE_TYPES.map((option) => ({ value: option, label: localize(SCOPE_TYPE_LABELS[option], locale) }))}
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
          {sorted.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#bdc8cd] bg-[#fffdf9] p-10 text-center text-sm text-[#64717c]">{localize(uiText.noResults, locale)}</p>
          ) : (
            <div className="space-y-3">
              {paginated.map((tender) => <TenderRow key={tender.id} tender={tender} />)}
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
            <h2 className="text-base font-bold">本周机会</h2>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/20 text-center">
              <div className="px-1 py-1.5"><p className="text-[11px] font-medium text-white/58">当前项目</p><p className="mt-1.5 text-[1.65rem] font-black leading-none">{sorted.length}</p></div>
              <button
                type="button"
                onClick={() => updateParams({ view: view === "new" ? null : "new", sort: view === "new" ? null : "publication_desc" })}
                className={`rounded-lg px-1 py-1.5 transition-colors ${view === "new" ? "bg-white/15" : "hover:bg-white/10"}`}
              >
                <p className="text-[11px] font-medium text-white/58">本周新增</p>
                <p className="mt-1.5 text-[1.65rem] font-black leading-none text-[#ffb21c]">{newThisWeekCount}</p>
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
            {savedReminders.length === 0 ? (
              <p className="mt-4 text-sm text-[#64717c]">待收藏项目特别提醒——点击项目上的收藏图标后，交标提醒会显示在这里。</p>
            ) : (
              <div className="mt-4 divide-y divide-[#e5e9eb]">
                {savedReminders.map((tender) => (
                  <Link key={tender.id} href={`/tenders/${tender.slug}`} className="block py-3 first:pt-0 last:pb-0">
                    <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#64717c]"><CountryFlag country={tender.country} />{countryLabel(tender.country, locale)}</span>
                    <p className="line-clamp-2 text-sm font-bold leading-5 text-[#172c3b]">{tender.title.zh || tender.title.es}</p>
                    <p className="mt-1.5 text-xs font-semibold text-[#b86e00]">{formatDate(tender.submissionDeadline!, locale)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
