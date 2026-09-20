"use client";

import type { TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { localize, useLocale } from "@/lib/i18n";
import {
  RELEVANCE_TIER_COLORS,
  RELEVANCE_TIER_LABELS,
  SCOPE_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  industryLabel,
} from "@/lib/tender-labels";
import { OBRAS_POR_IMPUESTOS_BADGE } from "@/lib/obras-por-impuestos";

/**
 * The pill row that heads a tender, wherever one is shown: the homepage card,
 * the /tenders list row, and both detail pages.
 *
 * ── Why this is one component and not four copies ────────────────────────
 *
 * The ORDER is the product decision (user, 2026-09-20: 标签排序= 项目规模、
 * 行业、项目阶段、项目类型), and an order is exactly the kind of rule that
 * survives in one place and rots in four. Each surface had grown its own
 * sequence already — the card led with the industries and put 项目类型 last,
 * the list row had no 项目规模 at all — which is how a reader who has just
 * filtered by 项目规模 ends up hunting for the answer in a different position
 * on every page. One component means the next change to the order is one
 * edit, and means a new surface cannot be born inconsistent.
 *
 * ── 常规项目 draws no pill ────────────────────────────────────────────────
 *
 * 常规 is the default band, so a pill on every ordinary row would be noise
 * across most of the page and would drain the colour from the two that are
 * meant to stand out. A row without the pill IS the 常规 case. 日常服务类
 * （排除）can never appear at all — those rows are not in the feed.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * The country flag. It is an attribute of the tender, not a tag the list
 * filters into these pills, and the three surfaces place it differently (the
 * card puts it down by the dates, the detail pages lead with it). Pulling it
 * in would have made this component own a layout decision it cannot see.
 */
export type TenderTagRowProps = {
  relevanceTier: TenderRelevanceTier;
  /** `string[]`, matching Tender.industries and the Postgres text[] column — industryLabel() already falls back to the raw string for an unrecognised key rather than crashing. */
  industries: string[];
  status: TenderStatus;
  scopeType: TenderScopeType;
  isObrasPorImpuestos?: boolean;
  /** `sm` on cards and list rows, `md` on the two detail pages, matching the type scale each already used. */
  size?: "sm" | "md";
};

export function TenderTagRow({
  relevanceTier,
  industries,
  status,
  scopeType,
  isObrasPorImpuestos = false,
  size = "sm",
}: TenderTagRowProps) {
  const { locale } = useLocale();
  const text = size === "sm" ? "text-[11px]" : "text-xs";
  const pill = `shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 ${text}`;

  return (
    <>
      {relevanceTier !== "standard" && relevanceTier !== "excluded" && (
        <span className={`${pill} font-black ${RELEVANCE_TIER_COLORS[relevanceTier]}`}>
          {localize(RELEVANCE_TIER_LABELS[relevanceTier], locale)}
        </span>
      )}
      {industries.map((industry) => (
        <span key={industry} className={`${pill} bg-[#edf2f3] font-semibold text-[#24465a]`}>
          {industryLabel(industry, locale)}
        </span>
      ))}
      <span className={`${pill} font-semibold ${STATUS_COLORS[status]}`}>
        {localize(STATUS_LABELS[status], locale)}
      </span>
      <span className={`${pill} border border-[#d8e0e3] font-medium text-[#566773]`}>
        {localize(SCOPE_TYPE_LABELS[scopeType], locale)}
      </span>
      {isObrasPorImpuestos && (
        <span className={`${pill} bg-[#e2eef5] font-black text-[#155573]`}>{OBRAS_POR_IMPUESTOS_BADGE}</span>
      )}
    </>
  );
}
