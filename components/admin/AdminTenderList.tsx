"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminTenderListRow } from "@/lib/db/tenders";
import { formatDate, formatEstimatedValueUsd } from "@/lib/format";
import { countryLabel, RELEVANCE_TIER_COLORS, RELEVANCE_TIER_LABELS, STATUS_LABELS } from "@/lib/tender-labels";

export function AdminTenderList({ tenders }: { tenders: AdminTenderListRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!q) return tenders;
    return tenders.filter(
      (t) =>
        t.title.zh.toLowerCase().includes(q) ||
        t.title.es.toLowerCase().includes(q) ||
        t.buyer.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.tenderNumber.toLowerCase().includes(q),
    );
  }, [tenders, query]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="按标题、采购单位、slug 或标书编号搜索…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full max-w-md rounded-xl border border-[#d8e0e3] bg-[#fffdf9] px-4 text-sm outline-none focus:border-[#ffb21c]"
      />
      <p className="text-xs text-[#64717c]">
        共 {tenders.length} 条，当前显示 {filtered.length} 条
      </p>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe2e5] bg-[#fffdf9]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-[#dbe2e5] bg-[#edf2f3] text-xs text-[#52636e]">
            <tr>
              <th className="px-4 py-3 font-medium">标题</th>
              <th className="px-4 py-3 font-medium">采购单位</th>
              <th className="px-4 py-3 font-medium">国家</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">相关度</th>
              <th className="px-4 py-3 font-medium">金额</th>
              <th className="px-4 py-3 font-medium">发布日期</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9eb]">
            {filtered.map((t) => {
              const value = t.estimatedValue ? formatEstimatedValueUsd(t.estimatedValue, t.currency, "zh") : null;
              return (
                <tr key={t.slug} className="transition-colors hover:bg-[#fff9ec]">
                  <td className="max-w-xs truncate px-4 py-3 font-bold text-[#071826]">{t.title.zh}</td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-[#5d6d77]">{t.buyer}</td>
                  <td className="px-4 py-3 text-[#5d6d77]">{countryLabel(t.country, "zh")}</td>
                  <td className="px-4 py-3 text-[#5d6d77]">{STATUS_LABELS[t.status].zh}</td>
                  <td className="px-4 py-3">
                    {t.relevanceTier && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RELEVANCE_TIER_COLORS[t.relevanceTier]}`}>
                        {RELEVANCE_TIER_LABELS[t.relevanceTier].zh}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#5d6d77]">{value ?? "—"}</td>
                  <td className="px-4 py-3 text-[#5d6d77]">
                    {formatDate(t.publicationDate, "zh")}
                    {t.publicationDateIsEstimated && (
                      <span title="该来源无真实发布日期字段，此为收录时间" className="ml-1.5 rounded-full bg-[#edf2f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#7a878f]">
                        估
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <Link
                        href={`/admin/tenders/${t.slug}`}
                        className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4"
                      >
                        编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(t.slug, t.title.zh)}
                        disabled={deletingSlug === t.slug}
                        className="font-bold text-red-600 underline decoration-red-300 decoration-2 underline-offset-4 hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingSlug === t.slug ? "删除中…" : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
