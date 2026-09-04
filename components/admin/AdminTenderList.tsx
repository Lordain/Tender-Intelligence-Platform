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
        className="h-11 w-full max-w-md rounded-xl border border-[#d8e0e3] bg-[#fffdf9] px-4 text-sm outline-none focus:border-[#ffb21c]"
      />
      <p className="text-xs text-[#64717c]">
        共 {tenders.length} 条，当前显示 {filtered.length} 条
      </p>

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
                  <td className="px-4 py-3 text-[#5d6d77]">{formatDate(t.publicationDate, "zh")}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/tenders/${t.slug}`}
                      className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4"
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
