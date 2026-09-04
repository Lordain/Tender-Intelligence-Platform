"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { ALL_INDUSTRIES } from "@/lib/industry";
import { formatDate, formatEstimatedValueUsdMillions } from "@/lib/format";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { INDUSTRY_LABELS, RELEVANCE_TIER_LABELS, SCOPE_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS, industryLabel } from "@/lib/tender-labels";
import { filterTenders, isSortKey, sortTenders, type SortKey } from "@/lib/filter-tenders";
import { MultiSelectPills } from "@/components/tenders/MultiSelectPills";
import { SaveSearchControl } from "@/components/tenders/SaveSearchControl";
import { SaveTenderButton } from "@/components/tenders/SaveTenderButton";
import { MexicoFlag } from "@/components/tenders/CountryFlag";

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
const PAGE_SIZE = 28;

function parseList(param: string | null): string[] {
  return param ? param.split(",").filter(Boolean) : [];
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
          <span className="inline-flex items-center gap-1.5"><MexicoFlag />墨西哥</span>
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

  const query = searchParams.get("q") ?? "";
  const industries = parseList(searchParams.get("industry"));
  const industryMatchMode = searchParams.get("industryMode") === "all" ? "all" : "any";
  const scopeTypes = parseList(searchParams.get("scope")) as TenderScopeType[];
  const statusParam = searchParams.get("status");
  const statuses = (statusParam !== null ? parseList(statusParam) : DEFAULT_STATUSES) as TenderStatus[];
  const tierParam = searchParams.get("tier");
  const relevanceTiers = (tierParam !== null ? parseList(tierParam) : DEFAULT_RELEVANCE_TIERS) as TenderRelevanceTier[];
  const sortParam = searchParams.get("sort");
  const sort: SortKey = isSortKey(sortParam) ? sortParam : "deadline_asc";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const hasActiveFilters = industries.length > 0 || scopeTypes.length > 0 || statusParam !== null || tierParam !== null || query.length > 0;

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
    () => filterTenders(tenders, { query, industries, industryMatchMode, scopeTypes, statuses, countries: ["Mexico"], relevanceTiers }, locale),
    [tenders, query, industries, industryMatchMode, scopeTypes, statuses, relevanceTiers, locale],
  );
  const sorted = useMemo(() => sortTenders(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const reminders = sorted.filter((tender) => tender.submissionDeadline).slice(0, 4);
  const currentSearchHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.04em] text-[#071826] sm:text-5xl">招标情报</h1>
          <p className="mt-2 text-base text-[#65747d]">发现并评估适合中国企业的墨西哥政府采购机会</p>
        </div>
        <p className="text-sm font-semibold text-[#52636e]">共 {sorted.length.toLocaleString()} 个项目</p>
      </header>

      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
        <form className="flex gap-3" onSubmit={(event) => event.preventDefault()}>
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
          <button type="submit" className="rounded-xl bg-[#ffb21c] px-7 text-sm font-black text-[#071826] hover:bg-[#ffc247]">搜索</button>
        </form>

        <div className="mt-5 flex flex-wrap items-start gap-4">
          <label className="flex min-w-[9.5rem] flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#425461]">国家 / 地区</span>
            <span className="flex h-10 items-center gap-2 rounded-xl border border-[#d8e0e3] bg-[#f2f4f3] px-3 text-sm font-semibold text-[#172c3b]"><MexicoFlag />墨西哥</span>
          </label>
          <MultiSelectPills
            label={localize(uiText.scaleLabel, locale)}
            options={RELEVANCE_TIERS.map((option) => ({ value: option, label: localize(RELEVANCE_TIER_LABELS[option], locale) }))}
            selected={relevanceTiers}
            onChange={(next) => updateParams({ tier: next.join(",") || null })}
          />
          <MultiSelectPills
            label="行业"
            searchable
            options={ALL_INDUSTRIES.map((option) => ({ value: option, label: localize(INDUSTRY_LABELS[option], locale) }))}
            selected={industries}
            onChange={(next) => updateParams({ industry: next.join(",") || null })}
          />
          <MultiSelectPills
            label="项目类型"
            options={SCOPE_TYPES.map((option) => ({ value: option, label: localize(SCOPE_TYPE_LABELS[option], locale) }))}
            selected={scopeTypes}
            onChange={(next) => updateParams({ scope: next.join(",") || null })}
          />
          <MultiSelectPills
            label="项目阶段"
            options={STATUSES.map((option) => ({ value: option, label: localize(STATUS_LABELS[option], locale) }))}
            selected={statuses}
            onChange={(next) => updateParams({ status: next.join(",") || null })}
          />
          <label className="flex min-w-[10rem] flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#425461]">计划交标时间</span>
            <select value={sort} onChange={(event) => updateParams({ sort: event.target.value })} className="h-10 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm text-[#172c3b] focus:border-[#ffb21c] focus:outline-none">
              <option value="deadline_asc">由近到远</option>
              <option value="publication_desc">最新发布</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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
          {hasActiveFilters && <SaveSearchControl href={currentSearchHref} />}
        </div>
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
            <div className="mt-7 flex items-center justify-center gap-3">
              <button type="button" onClick={() => updateParams({ page: String(currentPage - 1) }, false)} disabled={currentPage <= 1} className="rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-semibold disabled:opacity-40">上一页</button>
              <span className="rounded-xl bg-[#ffb21c] px-3 py-2 text-xs font-black">{currentPage}</span>
              <span className="text-xs text-[#6c7982]">/ {totalPages}</span>
              <button type="button" onClick={() => updateParams({ page: String(currentPage + 1) }, false)} disabled={currentPage >= totalPages} className="rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-xs font-semibold disabled:opacity-40">下一页</button>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl bg-[#061b2b] p-6 text-white">
            <h2 className="text-lg font-bold">本周机会</h2>
            <div className="mt-6 grid grid-cols-3 divide-x divide-white/20 text-center">
              <div><p className="text-xs text-white/60">当前项目</p><p className="mt-2 text-2xl font-black">{sorted.length}</p></div>
              <div><p className="text-xs text-white/60">即将交标</p><p className="mt-2 text-2xl font-black text-[#ffb21c]">{reminders.length}</p></div>
              <div><p className="text-xs text-white/60">已选行业</p><p className="mt-2 text-2xl font-black text-[#ffb21c]">{industries.length}</p></div>
            </div>
          </section>
          <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold text-[#071826]">交标提醒</h2><Link href="/saved" className="text-xs font-semibold text-[#24465a]">查看关注</Link></div>
            <div className="mt-4 divide-y divide-[#e5e9eb]">
              {reminders.map((tender) => (
                <Link key={tender.id} href={`/tenders/${tender.slug}`} className="block py-3 first:pt-0 last:pb-0">
                  <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#64717c]"><MexicoFlag />墨西哥</span>
                  <p className="line-clamp-2 text-sm font-bold leading-5 text-[#172c3b]">{tender.title.zh || tender.title.es}</p>
                  <p className="mt-1.5 text-xs font-semibold text-[#b86e00]">{formatDate(tender.submissionDeadline!, locale)}</p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
