"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TenderNeedingDocuments } from "@/types/tender";
import { useUser } from "@/lib/auth";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { countryLabel, RELEVANCE_TIER_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/lib/tender-labels";
import { BatchAnalyzeDocumentForm, MAX_BATCH_SELECTION } from "@/components/admin/BatchAnalyzeDocumentForm";
import { BatchDownloadDocumentsButton } from "@/components/admin/BatchDownloadDocumentsButton";
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

function BanIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <circle cx="12" cy="12" r="9" />
      <path d="m5.5 5.5 13 13" />
    </svg>
  );
}

const selectClass =
  "h-10 w-full rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm font-bold text-[#233846] outline-none transition-colors focus:border-[#ffb21c]";

export function DocumentsNeededView({ tenders: initialTenders }: { tenders: TenderNeedingDocuments[] }) {
  const { locale } = useLocale();
  const router = useRouter();
  const { user, loading } = useUser();
  const [tenders, setTenders] = useState(initialTenders);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [relevance, setRelevance] = useState("all");
  const [source, setSource] = useState("all");
  /** Only some sources publish machine-readable document URLs, so "which of these can I actually batch-download" is a different question from "which source is this" — and the one the admin is really asking. */
  const [downloadableOnly, setDownloadableOnly] = useState(false);
  /** "I already fetched this one's files" — see supabase/migrations/0043_documents_downloaded_at.sql. Not the same as 无法获取, which removes the row. */
  const [pendingDownloadOnly, setPendingDownloadOnly] = useState(false);
  const [dismissingSlug, setDismissingSlug] = useState<string | null>(null);
  const [markingSlug, setMarkingSlug] = useState<string | null>(null);
  // The selected tenders themselves, not just their slugs (2026-09-06): a
  // written tender is dropped from `tenders` immediately, and a panel that
  // looked its rows up in `tenders` would make the just-finished row —
  // along with its 已写入/一句话总结 result — vanish the moment it
  // succeeded, which is exactly when the admin wants to read it.
  const [selectedTenders, setSelectedTenders] = useState<TenderNeedingDocuments[]>([]);
  const [manualSlugs, setManualSlugs] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");

  function toggleSelected(tender: TenderNeedingDocuments) {
    setSelectedTenders((current) => {
      if (current.some((item) => item.slug === tender.slug)) return current.filter((item) => item.slug !== tender.slug);
      if (current.length >= MAX_BATCH_SELECTION) {
        alert(`最多同时选择 ${MAX_BATCH_SELECTION} 个项目一起分析。`);
        return current;
      }
      return [...current, tender];
    });
  }

  function addManualSlug() {
    const slug = manualInput.trim();
    if (!slug) return;
    if (manualSlugs.includes(slug)) {
      alert("这个项目已经在下面的列表中了。");
      return;
    }
    if (manualSlugs.length >= MAX_BATCH_SELECTION) {
      alert(`最多同时添加 ${MAX_BATCH_SELECTION} 个项目一起分析。`);
      return;
    }
    setManualSlugs((current) => [...current, slug]);
    setManualInput("");
  }

  /**
   * Optimism would be wrong here: the whole point of the marker is to be
   * trusted across a session that spans days, so it flips only once the write
   * has actually landed. The row stays in the worklist either way — it is
   * still waiting for its files to be uploaded.
   */
  async function toggleDownloaded(tender: TenderNeedingDocuments) {
    const downloaded = !tender.documentsDownloadedAt;
    setMarkingSlug(tender.slug);
    try {
      const res = await fetch(`/api/admin/tenders/${tender.slug}/documents-downloaded`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloaded }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { documentsDownloadedAt } = (await res.json()) as { documentsDownloadedAt: string | null };
      setTenders((prev) =>
        prev.map((item) =>
          item.slug === tender.slug ? { ...item, documentsDownloadedAt: documentsDownloadedAt ?? undefined } : item,
        ),
      );
    } catch {
      alert("标记失败，请稍后重试。");
    } finally {
      setMarkingSlug(null);
    }
  }

  async function dismissTender(slug: string) {
    if (!confirm("确定要把这条标书标记为「无法获取附件」吗？之后不会再出现在这个清单里（不影响它的相关度判定），后台项目管理里随时能再改回来。")) return;
    setDismissingSlug(slug);
    try {
      const res = await fetch(`/api/admin/tenders/${slug}/documents-unavailable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unavailable: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTenders((prev) => prev.filter((tender) => tender.slug !== slug));
      setSelectedTenders((prev) => prev.filter((item) => item.slug !== slug));
    } catch {
      alert("标记失败，请稍后重试。");
    } finally {
      setDismissingSlug(null);
    }
  }

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || loading) return;
    if (!user) router.push("/login");
  }, [loading, user, router]);

  const countries = useMemo(
    () => [...new Set(tenders.map((tender) => tender.country))].sort((a, b) => countryLabel(a, locale).localeCompare(countryLabel(b, locale), locale)),
    [locale, tenders],
  );

  // Built from the rows actually present rather than a hardcoded list, so a
  // new connector shows up here the day its first tender lands.
  const sources = useMemo(
    () =>
      [...new Set(tenders.map((tender) => tender.sourceName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, locale),
      ),
    [locale, tenders],
  );
  const downloadableCount = useMemo(() => tenders.filter((tender) => tender.documentLinkCount > 0).length, [tenders]);
  const pendingDownloadCount = useMemo(() => tenders.filter((tender) => !tender.documentsDownloadedAt).length, [tenders]);

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
      const matchesSource = source === "all" || tender.sourceName === source;
      const matchesDownloadable = !downloadableOnly || tender.documentLinkCount > 0;
      const matchesPending = !pendingDownloadOnly || !tender.documentsDownloadedAt;
      return matchesQuery && matchesCountry && matchesRelevance && matchesSource && matchesDownloadable && matchesPending;
    });
  }, [country, downloadableOnly, locale, pendingDownloadOnly, query, relevance, source, tenders]);

  const priorityCount = tenders.filter((tender) => tender.relevanceTier === "flagship" || tender.relevanceTier === "significant").length;
  const hasFilters = Boolean(query.trim()) || country !== "all" || relevance !== "all" || source !== "all" || downloadableOnly || pendingDownloadOnly;

  function clearFilters() {
    setDraftQuery("");
    setQuery("");
    setCountry("all");
    setRelevance("all");
    setSource("all");
    setDownloadableOnly(false);
    setPendingDownloadOnly(false);
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
        description={`${localize(uiText.documentsNeededSubtitle, locale)} 在同一页面完成官方正式投标入口核验、附件上传和分析。`}
        backHref="/admin/tenders"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4 shadow-[0_16px_40px_-38px_rgba(6,27,43,.45)]">
          <div className="flex items-center gap-2 text-xs font-bold text-[#75838c]"><span className="size-2 rounded-full bg-[#ffb21c]" />当前待处理</div>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#071826]">{tenders.length}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4 shadow-[0_16px_40px_-38px_rgba(6,27,43,.45)]">
          <div className="flex items-center gap-2 text-xs font-bold text-[#75838c]"><span className="size-2 rounded-full bg-[#c8d3d7]" />大型及中型项目</div>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#071826]">{priorityCount}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] px-5 py-4 shadow-[0_16px_40px_-38px_rgba(6,27,43,.45)]">
          <div className="flex items-center gap-2 text-xs font-bold text-[#75838c]"><span className="size-2 rounded-full bg-[#c8d3d7]" />涉及国家/地区</div>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#071826]">{countries.length}</p>
        </div>
      </div>

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
              <span className="sr-only">搜索待补文件项目</span>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#849098]"><SearchIcon /></span>
              <input
                type="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="按项目标题或标书 ID 搜索…"
                className="h-11 w-full rounded-xl border border-[#d8e0e3] bg-white pl-11 pr-4 text-sm text-[#071826] outline-none placeholder:text-[#9aa5ab] focus:border-[#ffb21c]"
              />
            </label>
            <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247]">
              搜索
            </button>
          </form>
          <p className="shrink-0 text-xs font-bold text-[#64717c]">显示 <span className="text-[#071826]">{filtered.length}</span> / {tenders.length} 个项目</p>
        </div>
        <div className="mt-4 grid gap-3 border-t border-[#e5e9eb] pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-end">
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
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-black text-[#52636e]">来源</span>
            <select value={source} onChange={(event) => setSource(event.target.value)} className={selectClass}>
              <option value="all">全部来源</option>
              {sources.map((item) => <option key={item} value={item}>{item}</option>)}
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
        {/* One row, wrapping only when it must (2026-09-12, user: 这两个选项并排 / 放在同一行). The explanatory tails move into title= so the two stay side by side at ordinary widths. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label
            title="目前只有秘鲁 SEACE/OECE 的项目自带官方标书链接，可以一键打包下载"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 text-xs font-black text-[#52636e] transition-colors hover:border-[#ffb21c]"
          >
            <input
              type="checkbox"
              checked={downloadableOnly}
              onChange={(event) => setDownloadableOnly(event.target.checked)}
              className="size-4 accent-[#ffb21c]"
            />
            只看能一键下载标书的（{downloadableCount} 个）
          </label>
          <label
            title="下载完一个就点那一行的「标记已下载」，这里就能只看剩下的"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#d8e0e3] bg-white px-3 py-2 text-xs font-black text-[#52636e] transition-colors hover:border-[#ffb21c]"
          >
            <input
              type="checkbox"
              checked={pendingDownloadOnly}
              onChange={(event) => setPendingDownloadOnly(event.target.checked)}
              className="size-4 accent-[#ffb21c]"
            />
            只看还没下载的（{pendingDownloadCount} 个）
          </label>
        </div>
      </div>

      {tenders.length === 0 ? (
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-8 text-center text-sm text-[#64717c]">{localize(uiText.documentsNeededEmpty, locale)}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] shadow-[0_18px_50px_-48px_rgba(6,27,43,.55)]">
          <table className="w-full min-w-[960px] table-fixed text-left text-xs">
            <thead className="border-b border-[#dbe2e5] bg-[#edf2f3] text-[11px] uppercase tracking-[0.06em] text-[#52636e]">
              <tr>
                {/*
                  The slug had 18% and showed a truncated
                  "peru-ocds-dgv273-seacev3-12…" on every Peru row — the
                  characters that differ are the ones cut off, so it was 18% of
                  the table spent on an ellipsis. It keeps enough to recognise a
                  row (the full value is still in the cell's title attribute and
                  is what the search box matches), and the title — the only
                  column anyone reads to decide — takes the difference.
                  2026-09-12, user: 更紧凑一点，比如标书ID可以再窄一点.
                */}
                <th className="w-9 px-3 py-2.5 font-black" title={`勾选最多 ${MAX_BATCH_SELECTION} 个项目一起批量分析`}>选</th>
                <th className="w-[34%] px-3 py-2.5 font-black">{localize(uiText.colTitle, locale)}</th>
                <th className="w-[7%] px-2 py-2.5 font-black">{localize(uiText.countryLabel, locale)}</th>
                <th className="w-[7%] px-2 py-2.5 font-black">状态</th>
                <th className="w-[11%] px-2 py-2.5 font-black">{localize(uiText.colTenderId, locale)}</th>
                <th className="w-[9%] px-2 py-2.5 font-black">{localize(uiText.colPublicationDate, locale)}</th>
                <th className="w-[29%] px-2 py-2.5 text-center font-black">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9eb]">
              {filtered.map((tender) => {
                const isSelected = selectedTenders.some((item) => item.slug === tender.slug);
                return (
                  <tr key={tender.slug} className={`transition-colors hover:bg-[#fff9ec] ${isSelected ? "bg-[#fff8e9]" : ""}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`选择「${localize(tender.title, locale)}」用于批量分析`}
                        checked={isSelected}
                        onChange={() => toggleSelected(tender)}
                        className="size-4 accent-[#ffb21c]"
                      />
                    </td>
                    <td title={localize(tender.title, locale)} className="truncate whitespace-nowrap px-3 py-2 font-black text-[#071826]">
                      {tender.documentsDownloadedAt && (
                        <span
                          title={`已于 ${formatDate(tender.documentsDownloadedAt, locale)} 标记为已下载`}
                          className="mr-1.5 inline-flex items-center rounded-md bg-[#e3f3e6] px-1.5 py-0.5 align-middle text-[10px] font-black text-[#1c6b2c]"
                        >
                          已下载
                        </span>
                      )}
                      {tender.documentLinkCount > 0 && (
                        <span
                          title={`这条项目有 ${tender.documentLinkCount} 份官方标书可以自动下载`}
                          className="mr-1.5 inline-flex items-center rounded-md bg-[#e8f1ff] px-1.5 py-0.5 align-middle text-[10px] font-black text-[#1b4d86]"
                        >
                          标书 {tender.documentLinkCount}
                        </span>
                      )}
                      {localize(tender.title, locale)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#425461]">
                      <span className="inline-flex items-center gap-1.5"><CountryFlag country={tender.country} />{countryLabel(tender.country, locale)}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_COLORS[tender.status]}`}>{STATUS_LABELS[tender.status][locale]}</span>
                    </td>
                    <td title={tender.slug} className="truncate whitespace-nowrap px-2 py-2 font-mono text-[10px] text-[#5d6d77]">{tender.slug}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-[#5d6d77]">{formatDate(tender.publicationDate, locale)}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <a
                          href={tender.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="打开这条项目的官方正式投标入口"
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#cbd6da] bg-white px-2.5 text-[11px] font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
                        >
                          <ExternalLinkIcon />官方入口
                        </a>
                        <button
                          type="button"
                          onClick={() => toggleSelected(tender)}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition-colors ${isSelected ? "border border-[#cbd6da] bg-white text-[#52636e]" : "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]"}`}
                        >
                          <UploadIcon />{isSelected ? "取消" : "选择上传"}
                        </button>
                        <button
                          type="button"
                          title={
                            tender.documentsDownloadedAt
                              ? `已于 ${formatDate(tender.documentsDownloadedAt, locale)} 标记为已下载——再点一次可取消`
                              : "标记为「标书已下载」——项目仍留在清单里等上传，只是不用再去下载了"
                          }
                          disabled={markingSlug === tender.slug}
                          onClick={() => toggleDownloaded(tender)}
                          className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            tender.documentsDownloadedAt
                              ? "border-[#a8d6b3] bg-[#e3f3e6] text-[#1c6b2c] hover:border-[#7fbf90]"
                              : "border-[#cbd6da] bg-white text-[#52636e] hover:border-[#7fbf90] hover:bg-[#edf7ee] hover:text-[#1c6b2c]"
                          }`}
                        >
                          <CheckIcon />
                          {tender.documentsDownloadedAt ? "已下载" : "标记下载"}
                        </button>
                        <button
                          type="button"
                          title="标记为无法获取附件——不再出现在此清单，不影响相关度判定"
                          disabled={dismissingSlug === tender.slug}
                          onClick={() => dismissTender(tender.slug)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#cbd6da] bg-white px-2.5 text-[11px] font-black text-[#8a5a00] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <BanIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <p className="font-black text-[#071826]">没有找到符合条件的项目</p>
                    <p className="mt-1 text-xs text-[#75838c]">可以尝试修改关键词或清除筛选条件</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedTenders.length > 0 && <BatchDownloadDocumentsButton tenders={selectedTenders} />}

      {selectedTenders.length > 0 && (
        <BatchAnalyzeDocumentForm
          tenders={selectedTenders}
          onClear={() => setSelectedTenders([])}
          // Only the worklist row goes away — the panel row (and its
          // result) stays until the admin clears the selection.
          onWritten={(slug) => setTenders((prev) => prev.filter((tender) => tender.slug !== slug))}
          // One refresh for the whole batch, not one per written tender:
          // each router.refresh() re-runs this page's server render and
          // its Supabase queries, and five of them for one click is four
          // wasted full-page round-trips.
          onFinished={() => router.refresh()}
        />
      )}

      <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
        <div className="mb-5 border-b border-[#e5e9eb] pb-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Any tender</p>
          <h2 className="mt-1 text-xl font-black text-[#071826]">手动上传分析（任意项目）</h2>
          <p className="mt-1 text-sm text-[#64717c]">用于补传第二份文件，重新分析已经存在附件的项目，或分析不在上面清单里的项目——最多同时添加 {MAX_BATCH_SELECTION} 个。</p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            addManualSlug();
          }}
        >
          <input
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder="输入项目 slug，例如 comprasmx-lo-09-jzo-009jzo001-t-36-2026"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm text-[#071826] outline-none placeholder:text-[#9aa5ab] focus:border-[#ffb21c]"
          />
          <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#071826] px-5 text-sm font-black text-white transition-colors hover:bg-[#12364d]">
            + 添加项目
          </button>
        </form>

        {manualSlugs.length === 0 ? (
          <p className="mt-4 text-sm text-[#8a959c]">还没有添加项目。</p>
        ) : (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {manualSlugs.map((slug) => (
                <span key={slug} className="inline-flex items-center gap-2 rounded-full border border-[#d8e0e3] bg-white py-1 pl-3 pr-1.5 font-mono text-[11px] text-[#425461]">
                  {slug}
                  <button
                    type="button"
                    aria-label={`移除 ${slug}`}
                    onClick={() => setManualSlugs((prev) => prev.filter((item) => item !== slug))}
                    className="flex size-4 items-center justify-center rounded-full text-[#8a959c] hover:bg-[#edf2f3] hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <BatchAnalyzeDocumentForm
              tenders={manualSlugs.map((slug) => ({ slug }))}
              onClear={() => setManualSlugs([])}
              // Manually-added slugs stay listed after a successful write
              // (the panel row is the only place its result is shown) —
              // the chip's × or 取消选择 removes them.
              onWritten={() => {}}
              onFinished={() => router.refresh()}
            />
          </div>
        )}
      </section>
    </div>
  );
}
