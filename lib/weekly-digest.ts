import type { Tender } from "@/types/tender";
import { publishedTenderLinks, type TenderLink } from "@/lib/tender-links";
import { countryPages } from "@/lib/country-pages";
import { countryLabel, industryLabel } from "@/lib/tender-labels";
import { compareWeeks, isoWeekOf, shiftWeek, weekDays, type IsoWeek } from "@/lib/weekly";

/**
 * What one week's digest says (2026-09-25). Everything here is derived from
 * the public tender list, so the page, its <title>, the archive and the
 * sitemap cannot disagree about a week.
 */
export type WeeklyDigest = {
  week: IsoWeek;
  links: TenderLink[];
  /** flagship + significant, the head of the page. */
  highlights: TenderLink[];
  byCountry: { country: string; links: TenderLink[] }[];
  /** Top industries by count, 综合 left out: it names nothing. */
  topIndustries: { industry: string; count: number }[];
  isCurrent: boolean;
};

/** How far back the archive and sitemap reach: the database keeps six months. */
export const ARCHIVE_WEEKS = 26;

export function weeklyDigest(all: Tender[], week: IsoWeek, now: Date = new Date()): WeeklyDigest {
  const links = publishedTenderLinks(all, weekDays(week));
  const highlights = links.filter((link) => link.relevanceTier === "flagship" || link.relevanceTier === "significant");
  const byCountry = countryPages
    .map((page) => ({ country: page.country, links: links.filter((link) => link.country === page.country) }))
    .filter((group) => group.links.length > 0)
    .sort((a, b) => b.links.length - a.links.length);
  const industryCounts = new Map<string, number>();
  for (const link of links) for (const industry of link.industries) if (industry !== "general") industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);
  const topIndustries = [...industryCounts]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return { week, links, highlights, byCountry, topIndustries, isCurrent: compareWeeks(week, isoWeekOf(now)) === 0 };
}

/** One plain sentence for the lead paragraph and the meta description. */
export function digestSummary(digest: WeeklyDigest): string {
  if (digest.links.length === 0) return digest.isCurrent ? "本周尚无新发布的项目，平台每日更新。" : "这一周没有新发布的项目。";
  const countries = digest.byCountry.map((group) => `${countryLabel(group.country, "zh")} ${group.links.length} 个`).join("、");
  const industries = digest.topIndustries.map((item) => `${industryLabel(item.industry, "zh")}（${item.count}）`).join("、");
  const lead = `${digest.isCurrent ? "本周截至目前" : "本周"}共新发布 ${digest.links.length} 个项目：${countries}。`;
  return industries ? `${lead}行业以${industries}为主。` : lead;
}

/** Weeks with at least one project, newest first, plus the current week even while empty. */
export function archiveWeeks(all: Tender[], now: Date = new Date()): { week: IsoWeek; count: number }[] {
  const current = isoWeekOf(now);
  const weeks: { week: IsoWeek; count: number }[] = [];
  for (let back = 0; back < ARCHIVE_WEEKS; back++) {
    const week = shiftWeek(current, -back);
    const count = publishedTenderLinks(all, weekDays(week)).length;
    if (count > 0 || back === 0) weeks.push({ week, count });
  }
  return weeks;
}
