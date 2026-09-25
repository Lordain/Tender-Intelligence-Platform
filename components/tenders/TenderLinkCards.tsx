import Link from "next/link";
import type { TenderLink } from "@/lib/tender-links";
import { formatDate } from "@/lib/format";
import { DEADLINE_IN_DOCUMENTS_LABEL } from "@/lib/deadline-labels";
import { publicTenderPath } from "@/lib/public-tender-url";
import { TenderTagRow } from "@/components/tenders/TenderTagRow";
import { industryLabel, RELEVANCE_TIER_COLORS, RELEVANCE_TIER_LABELS, STATUS_COLORS, STATUS_LABELS } from "@/lib/tender-labels";

/**
 * Short lists of live tenders, in the two looks the site already uses for a
 * list of links: the tender card (light pages) and the official-source rows
 * of the guides' dark 官方入口 panel (dark panels). Nothing here is a new
 * visual idea on purpose — these lists land inside pages whose design is
 * settled (user, 2026-09-25: 一定要保证页面设计和排版).
 *
 * A server component: the lists are links for crawlers first, and nothing on
 * them is interactive beyond the link itself.
 *
 * prefetch={false} on every link. /tenders/* sits behind the bot guard's
 * 40-requests-a-minute limit (lib/security/bot-protection.ts), and Next
 * prefetches every link that scrolls into view — a country page listing
 * two dozen tenders spent most of a visitor's minute before they clicked
 * anything, and the next page they opened came back 429. Found while
 * screenshotting this very page.
 */

function deadlineText(link: TenderLink): string {
  if (link.submissionDeadline) return formatDate(link.submissionDeadline, "zh");
  return link.deadlineInDocuments ? DEADLINE_IN_DOCUMENTS_LABEL : "未提供";
}

/** Card grid in the TenderCard look — for the detail page, guides and country pages. */
export function TenderLinkCards({ links, columns = 3 }: { links: TenderLink[]; columns?: 2 | 3 }) {
  return (
    <div className={`grid gap-4 ${columns === 3 ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
      {links.map((link) => (
        <Link
          key={link.id}
          href={publicTenderPath(link)}
          prefetch={false}
          className="group flex h-full flex-col gap-3 rounded-2xl border border-[#d8e0e3] bg-[#fffdf9] p-5 transition-all hover:-translate-y-0.5 hover:border-[#aebdc3] hover:shadow-[0_18px_50px_-32px_rgba(6,27,43,0.45)]"
        >
          {/* Two rows of pills reserved wherever cards sit side by side, so
              every title in a row starts at the same height however many tags
              its neighbours carry (user, 2026-09-25). 57px is two measured
              rows (25px pills + 6px gap); a stacked phone layout has no
              neighbour to line up with and keeps its natural height. */}
          <div className={`flex flex-wrap content-start items-center gap-1.5 ${columns === 3 ? "md:min-h-[57px]" : "sm:min-h-[57px]"}`}>
            <TenderTagRow
              relevanceTier={link.relevanceTier}
              industries={link.industries}
              status={link.status}
              scopeType={link.scopeType}
              isObrasPorImpuestos={link.isObrasPorImpuestos}
            />
          </div>
          <h3 className="line-clamp-3 min-h-[2.75rem] text-base font-black leading-snug text-black group-hover:text-[#163b52]">
            {link.titleZh}
          </h3>
          {/* No country line: every list this renders is one country's (a
              country page, a guide, a tender's related block), and each public
              title already opens with the country name. In the guides' narrow
              column the extra label was squeezed into a vertical 巴/西. */}
          <div className="mt-auto border-t border-[#e6eaec] pt-3">
            <span className="inline-flex whitespace-nowrap rounded-lg bg-[#fff6df] px-2 py-1 text-xs font-bold text-[#7a4f00]">计划交标 {deadlineText(link)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Rows in the look of the guides' dark 官方入口 panel — for the insight pages' dark closing section. */
export function TenderLinkRows({ links, accentText = "text-[#ffb21c]", accentBorder = "hover:border-[#ffb21c]" }: {
  links: TenderLink[];
  accentText?: string;
  accentBorder?: string;
}) {
  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <Link
          key={link.id}
          href={publicTenderPath(link)}
          prefetch={false}
          className={`flex flex-col gap-1.5 rounded-xl border border-white/12 bg-white/6 px-4 py-4 text-sm transition hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${accentBorder}`}
        >
          <span className="font-bold leading-6">{link.titleZh}</span>
          <span className={`shrink-0 text-xs font-bold ${accentText}`}>计划交标 {deadlineText(link)} →</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Light rows in the look of the insight pages' 资料来源 list — for the weekly
 * digest, where a country can have dozens of new tenders and a card each
 * would bury the week under scrolling. Status first, since a digest reader
 * needs to know which of last week's tenders are still worth opening.
 */
export function TenderLinkList({ links }: { links: TenderLink[] }) {
  return (
    <ul className="grid gap-2">
      {links.map((link) => (
        <li key={link.id}>
          <Link
            href={publicTenderPath(link)}
            prefetch={false}
            className="group flex flex-col gap-2 rounded-xl border border-[#dbe2e5] bg-[#fffdf9] px-4 py-3 transition hover:border-[#d29a28] hover:bg-[#fff8e8] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="flex min-w-0 items-start gap-2">
              <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[link.status]}`}>{STATUS_LABELS[link.status].zh}</span>
              {/* The digest lists biggest first; without the tier on the row that order reads as random dates. */}
              {(link.relevanceTier === "flagship" || link.relevanceTier === "significant") && (
                <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ${RELEVANCE_TIER_COLORS[link.relevanceTier]}`}>{RELEVANCE_TIER_LABELS[link.relevanceTier].zh}</span>
              )}
              <span className="text-sm font-black leading-6 text-black group-hover:text-[#163b52]">{link.titleZh}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-[#71808a]">
              {link.industries.filter((industry) => industry !== "general").slice(0, 2).map((industry) => (
                <span key={industry} className="whitespace-nowrap rounded-full bg-[#edf2f3] px-2 py-0.5 text-[11px] font-semibold text-[#24465a]">{industryLabel(industry, "zh")}</span>
              ))}
              <span className="whitespace-nowrap rounded-lg bg-[#fff6df] px-2 py-0.5 text-[11px] font-bold text-[#7a4f00]">计划交标 {deadlineText(link)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
