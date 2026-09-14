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
  industryLabel,
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

/**
 * The deadline as the YYYY-MM-DD the table shows, so a filter and the cell
 * beside it can never disagree about which day a tender is due.
 *
 * submission_deadline is a timestamptz and formatDate renders it in UTC, so
 * this reads the UTC day too — taking the browser's local day instead would
 * move an evening deadline to the next date for a reader in Asia and drop
 * the row out of a range that visibly contains it.
 */
function deadlineDay(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

const selectClass =
  "h-10 w-full rounded-xl border border-[#d8e0e3] bg-white px-2 text-sm font-bold text-[#233846] outline-none transition-colors focus:border-[#ffb21c]";

const dateClass =
  "h-10 min-w-0 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-1.5 text-sm font-bold text-[#233846] outline-none transition-colors focus:border-[#ffb21c] disabled:cursor-not-allowed disabled:bg-[#f2f4f3] disabled:text-[#a7b1b7]";

export function AdminTenderList({ tenders }: { tenders: AdminTenderListRow[] }) {
  const router = useRouter();
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState("all");
  const [relevance, setRelevance] = useState("all");
  const [analysis, setAnalysis] = useState("all");
  const [deadlinePresence, setDeadlinePresence] = useState("all");
  const [deadlineFrom, setDeadlineFrom] = useState("");
  const [deadlineTo, setDeadlineTo] = useState("");
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(
    () => [...new Set(tenders.map((tender) => tender.country))].sort((a, b) => countryLabel(a, "zh").localeCompare(countryLabel(b, "zh"), "zh")),
    [tenders],
  );

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

  // Takes the slugs the button was rendered for (selectedVisible below)
  // rather than reading `selected`, so what gets deleted is exactly what the
  // count on the bar was counting.
  async function handleBulkDelete(slugs: string[]) {
    if (slugs.length === 0) return;
    if (!confirm(`确定要删除这 ${slugs.length} 条项目吗？此操作无法撤销。`)) return;

    setBulkDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tenders/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelected(slug: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
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
      // Three questions, not one scale. "分析结果为空" is about every tender
      // that has an analysed document, while the other two are awarded-only —
      // see AdminTenderListRow.hasAnalysis / .analysisEmpty.
      const matchesAnalysis =
        analysis === "all" ||
        (analysis === "analysed_empty"
          ? tender.analysisEmpty === true
          : analysis === "with_analysis"
            ? tender.hasAnalysis === true
            : tender.hasAnalysis === false);
      // Leaving one end empty is an open-ended range; filling both with the
      // same day is how you ask for that single day. A tender the source
      // published no deadline for cannot satisfy either end, so it drops out
      // as soon as a bound is set — the count beside the search box is what
      // says how many that was.
      const day = deadlineDay(tender.submissionDeadline);
      const matchesDeadline =
        (!deadlineFrom && !deadlineTo) ||
        (day !== null && (!deadlineFrom || day >= deadlineFrom) && (!deadlineTo || day <= deadlineTo));
      // Separate from the range on purpose: a range can only ever narrow to
      // tenders that HAVE a deadline, so "which ones are still missing one"
      // — the list an admin works through when filling Peru deadlines in by
      // hand from the SEACE ficha — was unaskable with the range alone.
      const matchesPresence =
        deadlinePresence === "all" || (deadlinePresence === "missing" ? day === null : day !== null);

      return matchesQuery && matchesCountry && matchesStatus && matchesRelevance && matchesAnalysis && matchesDeadline && matchesPresence;
    });
  }, [analysis, country, deadlineFrom, deadlinePresence, deadlineTo, query, relevance, status, tenders]);

  // Changing any filter drops the selection. Without this the red bar
  // survives a filter change still holding rows that are no longer on screen:
  // it reads 已选择 1 项 over a list showing something else entirely, and
  // 批量删除 then deletes a tender the admin never looked at. Deletion is not
  // undoable, so the selection does not outlive the view it was made in.
  //
  // Every filter state has to appear here. selectedVisible below is the guard
  // for the day one is added and this line is forgotten.
  const filterKey = [query, country, status, relevance, analysis, deadlinePresence, deadlineFrom, deadlineTo].join("\u0000");
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (filterKey !== seenFilterKey) {
    setSeenFilterKey(filterKey);
    if (selected.size > 0) setSelected(new Set());
  }

  // What 批量删除 actually acts on, and what the bar counts: never more than
  // what is on screen right now. Derived from `filtered`, so it narrows with
  // every filter — including any filter added later — whether or not the key
  // above knows about it.
  const selectedVisible = useMemo(
    () => filtered.filter((tender) => selected.has(tender.slug)).map((tender) => tender.slug),
    [filtered, selected],
  );

  const hasFilters = Boolean(query.trim()) || country !== "all" || status !== "all" || relevance !== "all" || analysis !== "all"
    || Boolean(deadlineFrom) || Boolean(deadlineTo) || deadlinePresence !== "all";

  function clearFilters() {
    setDraftQuery("");
    setQuery("");
    setCountry("all");
    setStatus("all");
    setRelevance("all");
    setAnalysis("all");
    setDeadlinePresence("all");
    setDeadlineFrom("");
    setDeadlineTo("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(draftQuery);
            }}
          >
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">搜索项目</span>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#849098]"><SearchIcon /></span>
              <input
                type="search"
                placeholder="按标题、采购单位、slug 或标书编号搜索…"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                className="h-11 w-full rounded-xl border border-[#d8e0e3] bg-white pl-11 pr-4 text-sm text-[#071826] outline-none transition-colors placeholder:text-[#9aa5ab] focus:border-[#ffb21c]"
              />
            </label>
            <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247]">
              搜索
            </button>
          </form>
          <p className="shrink-0 text-xs font-bold text-[#64717c]">
            显示 <span className="text-[#071826]">{filtered.length}</span> / {tenders.length} 个项目
          </p>
        </div>

        <div className="mt-4 grid gap-3 border-t border-[#e5e9eb] pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.7fr)_auto] lg:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="whitespace-nowrap text-xs font-black text-[#52636e]">国家/地区</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)} className={selectClass}>
              <option value="all">全部国家</option>
              {countries.map((item) => <option key={item} value={item}>{countryLabel(item, "zh")}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="whitespace-nowrap text-xs font-black text-[#52636e]">项目状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>
              <option value="all">全部状态</option>
              {STATUS_KEYS.map((key) => <option key={key} value={key}>{STATUS_LABELS[key].zh}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="whitespace-nowrap text-xs font-black text-[#52636e]">相关度</span>
            <select value={relevance} onChange={(event) => setRelevance(event.target.value)} className={selectClass}>
              <option value="all">全部相关度</option>
              {RELEVANCE_KEYS.map((key) => <option key={key} value={key}>{RELEVANCE_TIER_LABELS[key].zh}</option>)}
              <option value="unclassified">未分类</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="whitespace-nowrap text-xs font-black text-[#52636e]">标书分析</span>
            <select value={analysis} onChange={(event) => setAnalysis(event.target.value)} className={selectClass}>
              <option value="all">不限</option>
              <option value="without_analysis">无标书分析（仅已中标）</option>
              <option value="with_analysis">已有标书分析（仅已中标）</option>
              {/* The worklist the other two cannot show: a document WAS
                  analysed and produced nothing. Either the wrong file was
                  fetched, or it is a scan the text path could not read. */}
              <option value="analysed_empty">分析结果为空（0/0/0/0）</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="whitespace-nowrap text-xs font-black text-[#52636e]">交标日期</span>
            <select
              value={deadlinePresence}
              onChange={(event) => setDeadlinePresence(event.target.value)}
              className={selectClass}
            >
              <option value="all">不限</option>
              <option value="missing">缺交标日期</option>
              <option value="present">已有交标日期</option>
            </select>
          </label>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
            <span className="whitespace-nowrap text-xs font-black text-[#52636e]">交标截止日期</span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="交标截止日期起"
                value={deadlineFrom}
                max={deadlineTo || undefined}
                disabled={deadlinePresence === "missing"}
                onChange={(event) => setDeadlineFrom(event.target.value)}
                className={dateClass}
              />
              <span className="shrink-0 text-xs font-bold text-[#849098]">至</span>
              <input
                type="date"
                aria-label="交标截止日期止"
                value={deadlineTo}
                min={deadlineFrom || undefined}
                disabled={deadlinePresence === "missing"}
                onChange={(event) => setDeadlineTo(event.target.value)}
                className={dateClass}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="h-10 whitespace-nowrap rounded-xl border border-[#d8e0e3] bg-white px-3 text-xs font-black text-[#52636e] transition-colors hover:border-[#9aa5ab] hover:text-[#071826] disabled:cursor-not-allowed disabled:opacity-40"
          >
            清除筛选
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {selectedVisible.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-xs font-bold text-red-700">已选择 {selectedVisible.length} 项</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-bold text-[#52636e] hover:underline"
            >
              取消选择
            </button>
            <button
              type="button"
              onClick={() => handleBulkDelete(selectedVisible)}
              disabled={bulkDeleting}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-black text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              <TrashIcon />{bulkDeleting ? "删除中…" : "批量删除"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] shadow-[0_18px_50px_-48px_rgba(6,27,43,.55)]">
        <table className="w-full min-w-[1020px] table-fixed text-left text-xs">
          <thead className="border-b border-[#dbe2e5] bg-[#edf2f3] text-[11px] uppercase tracking-[0.06em] text-[#52636e]">
            <tr>
              <th className="w-[4%] px-2 py-3 text-center font-black">
                <input
                  type="checkbox"
                  aria-label="全选当前筛选结果"
                  checked={filtered.length > 0 && filtered.every((tender) => selected.has(tender.slug))}
                  onChange={(event) => {
                    if (event.target.checked) setSelected(new Set(filtered.map((tender) => tender.slug)));
                    else setSelected(new Set());
                  }}
                  className="size-4 accent-[#ffb21c]"
                />
              </th>
              <th className="w-[25%] px-3 py-3 font-black">标题</th>
              <th className="w-[12%] px-2 py-3 font-black">行业</th>
              <th className="w-[7%] px-2 py-3 font-black">国家</th>
              <th className="w-[7%] px-2 py-3 font-black">状态</th>
              <th className="w-[9%] px-2 py-3 font-black">相关度</th>
              <th className="w-[8%] px-2 py-3 font-black">金额</th>
              <th className="w-[10%] px-2 py-3 font-black">发布 / 交标</th>
              <th className="w-[16%] px-3 py-3 text-center font-black">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9eb]">
            {filtered.map((tender) => {
              const value = tender.estimatedValue ? formatEstimatedValueUsd(tender.estimatedValue, tender.currency, "zh") : null;
              return (
                <tr key={tender.slug} className="transition-colors hover:bg-[#fff9ec]">
                  <td className="px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${tender.title.zh}`}
                      checked={selected.has(tender.slug)}
                      onChange={(event) => toggleSelected(tender.slug, event.target.checked)}
                      className="size-4 accent-[#ffb21c]"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <p title={tender.title.zh} className="truncate whitespace-nowrap text-[12px] font-black text-[#071826]">{tender.title.zh}</p>
                  </td>
                  <td className="px-2 py-3">
                    {tender.industries.length > 0 ? (
                      <div className="flex flex-nowrap gap-1 overflow-hidden" title={tender.industries.map((industry) => industryLabel(industry, "zh")).join("、")}>
                        {tender.industries.slice(0, 2).map((industry) => (
                          <span key={industry} className="truncate rounded-full bg-[#edf2f3] px-2 py-1 text-[10px] font-bold text-[#314b5c]">
                            {industryLabel(industry, "zh")}
                          </span>
                        ))}
                        {tender.industries.length > 2 && (
                          <span className="shrink-0 rounded-full bg-[#edf2f3] px-1.5 py-1 text-[10px] font-bold text-[#64717c]">+{tender.industries.length - 2}</span>
                        )}
                      </div>
                    ) : <span className="text-[#9aa5ab]">未标注</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-[11px] text-[#425461]">
                    <span className="inline-flex items-center gap-1.5"><CountryFlag country={tender.country} />{countryLabel(tender.country, "zh")}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_COLORS[tender.status]}`}>{STATUS_LABELS[tender.status].zh}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3">
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
                  <td title={value ?? undefined} className="truncate whitespace-nowrap px-2 py-3 text-[11px] font-bold text-[#425461]">{value ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-[11px] text-[#5d6d77]">
                    <span className="block">
                      {formatDate(tender.publicationDate, "zh")}
                      {tender.publicationDateIsEstimated && (
                        <span title="该来源无真实发布日期字段，此为收录时间" className="ml-1.5 rounded-full bg-[#edf2f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#7a878f]">估</span>
                      )}
                    </span>
                    {/* Filtering on a date the table does not show leaves the
                        admin unable to tell a working filter from a broken
                        one, so the deadline sits under the publication date
                        rather than in a column of its own. */}
                    <span className="mt-0.5 block text-[10px] text-[#7a878f]">
                      {tender.submissionDeadline
                        ? `交标 ${formatDate(tender.submissionDeadline, "zh")}`
                        : "交标 —"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/admin/tenders/${tender.slug}`}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#cbd6da] bg-white px-2 text-[10px] font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
                      >
                        <PencilIcon />编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(tender.slug, tender.title.zh)}
                        disabled={deletingSlug === tender.slug}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 text-[10px] font-black text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
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
