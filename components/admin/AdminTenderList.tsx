"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminTenderListRow } from "@/lib/db/tenders";
import { formatDate, formatEstimatedValueUsd } from "@/lib/format";
import { countryLabel, RELEVANCE_TIER_COLORS, RELEVANCE_TIER_LABELS, STATUS_LABELS } from "@/lib/tender-labels";

export function AdminTenderList({ tenders }: { tenders: AdminTenderListRow[] }) {
  const [query, setQuery] = useState("");

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
        className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <p className="text-xs text-zinc-500">
        共 {tenders.length} 条，当前显示 {filtered.length} 条
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
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
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((t) => {
              const value = t.estimatedValue ? formatEstimatedValueUsd(t.estimatedValue, t.currency, "zh") : null;
              return (
                <tr key={t.slug}>
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">{t.title.zh}</td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400">{t.buyer}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{countryLabel(t.country, "zh")}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{STATUS_LABELS[t.status].zh}</td>
                  <td className="px-4 py-3">
                    {t.relevanceTier && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RELEVANCE_TIER_COLORS[t.relevanceTier]}`}>
                        {RELEVANCE_TIER_LABELS[t.relevanceTier].zh}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{value ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatDate(t.publicationDate, "zh")}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/tenders/${t.slug}`}
                      className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
                    >
                      编辑
                    </Link>
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
