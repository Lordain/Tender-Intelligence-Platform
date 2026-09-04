"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TenderNeedingDocuments } from "@/types/tender";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { countryLabel, RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
import { AnalyzeDocumentForm } from "@/components/admin/AnalyzeDocumentForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CountryFlag } from "@/components/tenders/CountryFlag";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M14 5h5v5M13 11l6-6M19 13v6H5V5h6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M12 16V4m0 0L7 9m5-5 5 5M5 15v5h14v-5" />
    </svg>
  );
}

const selectClass =
  "h-10 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm font-bold text-[#233846] outline-none transition-colors focus:border-[#ffb21c]";

export function DocumentsNeededView({ tenders }: { tenders: TenderNeedingDocuments[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const { user, loading } = useUser();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [relevance, setRelevance] = useState("all");

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || loading) return;
    if (!user) router.push("/login");
  }, [loading, user, router]);

  const countries = useMemo(
    () => [...new Set(tenders.map((tender) => tender.country))].sort((a, b) => countryLabel(a, locale).localeCompare(countryLabel(b, locale), locale)),
    [locale, tenders],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tenders.filter((tender) => {
      const matchesQuery =
        !normalizedQuery ||
        localize(tender.title, locale).toLowerCase().includes(normalizedQuery) ||
        tender.title.es.toLowerCase().includes(normalizedQuery) ||
        tender.slug.toLowerCase().includes(normalizedQuery);
      const matchesCountry = country === "all" || tender.country === country;
      const matchesRelevance = relevance === "all" || tender.relevanceTier === relevance;
      return matchesQuery && matchesCountry && matchesRelevance;
    });
  }, [country, locale, query, relevance, tenders]);

  const priorityCount = tenders.filter((tender) => tender.relevanceTier === "flagship" || tender.relevanceTier === "significant").length;
  const hasFilters = Boolean(query.trim()) || country !== "all" || relevance !== "all";

  function clearFilters() {
    setQuery("");
    setCountry("all");
    setRelevance("all");
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6 text-sm text-[#64717c]">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
    );
  }

  if (loading || !user) return null;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Document worklist"
        title={localize(uiText.documentsNeededTitle, locale)}
        description={`${localize(uiText.documentsNeededSubtitle, locale)} 在同一页面完成来源核验、附件上传和分析。`}
        backHref="/admin/tenders"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#061b2b] px-5 py-4 text-white">
          <p className="text-xs font-bold text-white/55">当前待处理</p>
          <p className="mt-1 text-3xl font-black text-[#ffb21c]">{tenders.length}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4">
          <p className="text-xs font-bold text-[#75838c]">旗舰及重点项目</p>
          <p className="mt-1 text-3xl font-black text-[#071826]">{priorityCount}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4">
          <p className="text-xs font-bold text-[#75838c]">涉及国家/地区</p>
          <p className="mt-1 text-3xl font-black text-[#071826]">{countries.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">搜索待补文件项目</span>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#849098]"><SearchIcon /></span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="按项目标题或标书 ID 搜索…"
              className="h-11 w-full rounded-xl border border-[#d8e0e3] bg-white pl-11 pr-4 text-sm text-[#071826] outline-none placeholder:text-[#9aa5ab] focus:border-[#ffb21c]"
            />
          </label>
          <p className="shrink-0 text-xs font-bold text-[#64717c]">显示 <span className="text-[#071826]">{filtered.length}</span> / {tenders.length} 个项目</p>
        </div>
        <div className="mt-4 grid gap-3 border-t border-[#e5e9eb] pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-[#52636e]">国家/地区</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)} className={selectClass}>
              <option value="all">全部国家</option>
              {countries.map((item) => <option key={item} value={item}>{countryLabel(item, locale)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-[#52636e]">相关度</span>
            <select value={relevance} onChange={(event) => setRelevance(event.target.value)} className={selectClass}>
              <option value="all">全部相关度</option>
              {Object.entries(RELEVANCE_TIER_LABELS).map(([key, label]) => <option key={key} value={key}>{label[locale]}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="h-10 rounded-xl border border-[#d8e0e3] bg-white px-4 text-xs font-black text-[#52636e] transition-colors hover:border-[#9aa5ab] hover:text-[#071826] disabled:cursor-not-allowed disabled:opacity-40"
          >
            清除筛选
          </button>
        </div>
      </div>

      {tenders.length === 0 ? (
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-8 text-center text-sm text-[#64717c]">{localize(uiText.documentsNeededEmpty, locale)}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] shadow-[0_18px_50px_-48px_rgba(6,27,43,.55)]">
          <table className="w-full min-w-[980px] table-fixed text-left text-xs">
            <thead className="border-b border-[#dbe2e5] bg-[#edf2f3] text-[11px] uppercase tracking-[0.06em] text-[#52636e]">
              <tr>
                <th className="w-[30%] px-4 py-3 font-black">{localize(uiText.colTitle, locale)}</th>
                <th className="w-[10%] px-3 py-3 font-black">{localize(uiText.countryLabel, locale)}</th>
                <th className="w-[29%] px-3 py-3 font-black">{localize(uiText.colTenderId, locale)}</th>
                <th className="w-[13%] px-3 py-3 font-black">{localize(uiText.colPublicationDate, locale)}</th>
                <th className="w-[18%] px-3 py-3 text-center font-black">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9eb]">
              {filtered.map((tender) => {
                const isOpen = openSlug === tender.slug;
                return (
                  <Fragment key={tender.slug}>
                    <tr className="transition-colors hover:bg-[#fff9ec]">
                      <td title={localize(tender.title, locale)} className="truncate whitespace-nowrap px-4 py-3 font-black text-[#071826]">{localize(tender.title, locale)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#425461]">
                        <span className="inline-flex items-center gap-1.5"><CountryFlag country={tender.country} />{countryLabel(tender.country, locale)}</span>
                      </td>
                      <td title={tender.slug} className="truncate whitespace-nowrap px-3 py-3 font-mono text-[11px] text-[#5d6d77]">{tender.slug}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[#5d6d77]">{formatDate(tender.publicationDate, locale)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <a
                            href={tender.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#cbd6da] bg-white px-3 text-[11px] font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
                          >
                            <ExternalLinkIcon />来源链接
                          </a>
                          <button
                            type="button"
                            onClick={() => setOpenSlug(isOpen ? null : tender.slug)}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition-colors ${isOpen ? "border border-[#cbd6da] bg-white text-[#52636e]" : "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]"}`}
                          >
                            <UploadIcon />{isOpen ? "收起" : "上传分析"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="bg-[#f7f5ef] px-5 py-5">
                          <AnalyzeDocumentForm
                            initialSlug={tender.slug}
                            lockSlug
                            compact
                            onDone={() => {
                              setOpenSlug(null);
                              router.refresh();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <p className="font-black text-[#071826]">没有找到符合条件的项目</p>
                    <p className="mt-1 text-xs text-[#75838c]">可以尝试修改关键词或清除筛选条件</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <div className="mb-5 border-b border-[#e5e9eb] pb-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Any tender</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">手动上传分析</h2>
          <p className="mt-1 text-sm text-[#64717c]">用于补传第二份文件，或重新分析已经存在附件的项目。</p>
        </div>
        <AnalyzeDocumentForm compact />
      </section>
    </div>
  );
}
