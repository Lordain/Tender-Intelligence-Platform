"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminTenderListRow } from "@/lib/db/tenders";
import type { TenderRelevanceTier, TenderStatus } from "@/types/tender";
import { formatDate, formatEstimatedValueUsd } from "@/lib/format";
import {
  countryLabel,
  RELEVANCE_TIER_COLORS,
  RELEVANCE_TIER_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/tender-labels";
import { CountryFlag } from "@/components/tenders/CountryFlag";

const STATUS_KEYS = Object.keys(STATUS_LABELS) as TenderStatus[];
const RELEVANCE_KEYS = Object.keys(RELEVANCE_TIER_LABELS) as TenderRelevanceTier[];

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6" />
    </svg>
  );
}

const selectClass =
  "h-10 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm font-bold text-[#233846] outline-none transition-colors focus:border-[#ffb21c]";

export function AdminTenderList({ tenders }: { tenders: AdminTenderListRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [relevance, setRelevance] = useState("all");
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(
    () => [...new Set(tenders.map((tender) => tender.country))].sort((a, b) => countryLabel(a, "zh").localeCompare(countryLabel(b, "zh"), "zh")),
    [tenders],
  );

  async function handleToggleFeatured(slug: string, next: boolean) {
    setTogglingSlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${slug}/homepage-featured`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingSlug(null);
    }
  }

  async function handleDelete(slug: string, titleZh: string) {
    if (!confirm(`确定要删除「${titleZh}」吗？此操作无法撤销。`)) return;

    setDeletingSlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenders/${slug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingSlug(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenders.filter((tender) => {
      const matchesQuery =
        !q ||
        tender.title.zh.toLowerCase().includes(q) ||
        tender.title.es.toLowerCase().includes(q) ||
        tender.buyer.toLowerCase().includes(q) ||
        tender.slug.toLowerCase().includes(q) ||
        tender.tenderNumber.toLowerCase().includes(q);
      const matchesCountry = country === "all" || tender.country === country;
      const matchesStatus = status === "all" || tender.status === status;
      const matchesRelevance =
        relevance === "all" ||
        (relevance === "unclassified" ? !tender.relevanceTier : tender.relevanceTier === relevance);

      return matchesQuery && matchesCountry && matchesStatus && matchesRelevance;
    });
  }, [country, query, relevance, status, tenders]);

  const hasFilters = Boolean(query.trim()) || country !== "all" || status !== "all" || relevance !== "all";

  function clearFilters() {
    setQuery("");
    setCountry("all");
    setStatus("all");
    setRelevance("all");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">搜索项目</span>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#849098]"><SearchIcon /></span>
            <input
              type="search"
              placeholder="按标题、采购单位、slug 或标书编号搜索…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#d8e0e3] bg-white pl-11 pr-4 text-sm text-[#071826] outline-none transition-colors placeholder:text-[#9aa5ab] focus:border-[#ffb21c]"
            />
          </label>
          <p className="shrink-0 text-xs font-bold text-[#64717c]">
            显示 <span className="text-[#071826]">{filtered.length}</span> / {tenders.length} 个项目
          </p>
        </div>

        <div className="mt-4 grid gap-3 border-t border-[#e5e9eb] pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-[#52636e]">国家/地区</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)} className={selectClass}>
              <option value="all">全部国家</option>
              {countries.map((item) => <option key={item} value={item}>{countryLabel(item, "zh")}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-[#52636e]">项目状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>
              <option value="all">全部状态</option>
              {STATUS_KEYS.map((key) => <option key={key} value={key}>{STATUS_LABELS[key].zh}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-[#52636e]">相关度</span>
            <select value={relevance} onChange={(event) => setRelevance(event.target.value)} className={selectClass}>
              <option value="all">全部相关度</option>
              {RELEVANCE_KEYS.map((key) => <option key={key} value={key}>{RELEVANCE_TIER_LABELS[key].zh}</option>)}
              <option value="unclassified">未分类</option>
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

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] shadow-[0_18px_50px_-48px_rgba(6,27,43,.55)]">
        <table className="w-full min-w-[1240px] table-fixed text-left text-[13px]">
          <thead className="border-b border-[#dbe2e5] bg-[#edf2f3] text-[11px] uppercase tracking-[0.06em] text-[#52636e]">
            <tr>
              <th className="w-[29%] px-4 py-3 font-black">标题</th>
              <th className="w-[13%] px-3 py-3 font-black">采购单位</th>
              <th className="w-[8%] px-3 py-3 font-black">国家</th>
              <th className="w-[8%] px-3 py-3 font-black">状态</th>
              <th className="w-[10%] px-3 py-3 font-black">相关度</th>
              <th className="w-[5%] px-3 py-3 text-center font-black" title="免费用户在首页能看到的项目——见列表上方“首页免费展示设置”">首页</th>
              <th className="w-[10%] px-3 py-3 font-black">金额</th>
              <th className="w-[9%] px-3 py-3 font-black">发布日期</th>
              <th className="w-[8%] px-3 py-3 text-right font-black">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9eb]">
            {filtered.map((tender) => {
              const value = tender.estimatedValue ? formatEstimatedValueUsd(tender.estimatedValue, tender.currency, "zh") : null;
              return (
                <tr key={tender.slug} className="transition-colors hover:bg-[#fff9ec]">
                  <td className="px-4 py-3">
                    <p title={tender.title.zh} className="truncate whitespace-nowrap font-black text-[#071826]">{tender.title.zh}</p>
                  </td>
                  <td title={tender.buyer} className="truncate whitespace-nowrap px-3 py-3 text-[#5d6d77]">{tender.buyer}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[#425461]">
                    <span className="inline-flex items-center gap-1.5"><CountryFlag country={tender.country} />{countryLabel(tender.country, "zh")}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_COLORS[tender.status]}`}>{STATUS_LABELS[tender.status].zh}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {tender.relevanceTier ? (
                      <span
                        title={tender.relevanceManuallyOverridden ? "管理员手动锁定，重新入库不会被自动分类覆盖" : undefined}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${RELEVANCE_TIER_COLORS[tender.relevanceTier]}`}
                      >
                        {tender.relevanceManuallyOverridden && <span aria-label="已锁定">🔒</span>}
                        {RELEVANCE_TIER_LABELS[tender.relevanceTier].zh}
                      </span>
                    ) : <span className="text-[#9aa5ab]">未分类</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${tender.title.zh}首页展示`}
                      checked={tender.homepageFeatured ?? false}
                      disabled={togglingSlug === tender.slug}
                      onChange={(event) => handleToggleFeatured(tender.slug, event.target.checked)}
                      className="size-4 accent-[#ffb21c] disabled:opacity-50"
                    />
                  </td>
                  <td title={value ?? undefined} className="truncate whitespace-nowrap px-3 py-3 font-bold text-[#425461]">{value ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-[#5d6d77]">
                    {formatDate(tender.publicationDate, "zh")}
                    {tender.publicationDateIsEstimated && (
                      <span title="该来源无真实发布日期字段，此为收录时间" className="ml-1.5 rounded-full bg-[#edf2f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#7a878f]">估</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/admin/tenders/${tender.slug}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#cbd6da] bg-white px-2.5 text-[11px] font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
                      >
                        <PencilIcon />编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(tender.slug, tender.title.zh)}
                        disabled={deletingSlug === tender.slug}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-black text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                      >
                        <TrashIcon />{deletingSlug === tender.slug ? "删除中…" : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-14 text-center">
                  <p className="font-black text-[#071826]">没有找到符合条件的项目</p>
                  <p className="mt-1 text-xs text-[#75838c]">可以尝试修改关键词或清除筛选条件</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
