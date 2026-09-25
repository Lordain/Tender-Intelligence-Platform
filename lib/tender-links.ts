import type { IndustryKey } from "@/lib/industry";
import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { filterTenders } from "@/lib/filter-tenders";
import { LIVE_TENDER_STATUSES, toTenderListItem } from "@/lib/tender-list-page";
import { participationGuideForTender } from "@/lib/participation-guides";

/**
 * A short, crawlable list of live tenders — the links a country page, a
 * guide, an insight page and a tender's own detail page point at.
 *
 * Built for search engines as much as for readers (2026-09-25): Google had
 * found 262 tender URLs it had not yet crawled, and the reason is plain —
 * almost nothing on the site linked to them except the sitemap. These lists
 * are the internal links. The user capped the related-project blocks at three
 * (不超过3个项目), so a guide or a detail page stays about its own subject.
 *
 * Every field goes through toTenderListItem() WITHOUT memberView — the guest
 * projection. These lists render on pages every crawler and every
 * logged-out visitor reads, so the title is the de-identified public one and
 * the deadline is month precision, exactly as on /tenders for a guest.
 */
export type TenderLink = {
  id: string;
  publicSlug: string;
  titleZh: string;
  country: string;
  industries: IndustryKey[];
  relevanceTier: TenderRelevanceTier;
  status: TenderStatus;
  scopeType: TenderScopeType;
  isObrasPorImpuestos: boolean;
  /** Month precision ("2026-10") — never the day. */
  submissionDeadline?: string;
  deadlineInDocuments?: true;
};

/** A row whose Chinese title has not been generated yet shows this placeholder; it makes a poor link. */
const PLACEHOLDER_TITLE = "政府采购项目";

const TIER_WEIGHT: Record<TenderRelevanceTier, number> = { flagship: 3, significant: 2, standard: 1, excluded: 0 };

/**
 * Live, publicly visible tenders only: the excluded tier is out (as on every
 * public surface), and so is any row whose status says it is still open but
 * whose own deadline has already passed — a stale status should not be the
 * thing a new visitor clicks first.
 */
function liveCandidates(all: Tender[], countries: string[] | undefined, now: Date): Tender[] {
  const nowMs = now.getTime();
  return filterTenders(all, { statuses: LIVE_TENDER_STATUSES, countries }, "zh").filter((tender) => {
    if (!tender.submissionDeadline) return true;
    const deadline = new Date(tender.submissionDeadline).getTime();
    return !Number.isFinite(deadline) || deadline >= nowMs;
  });
}

/** Nearest deadline first; a tender without one goes after every dated one. */
function byDeadline(a: Tender, b: Tender): number {
  const da = a.submissionDeadline ? new Date(a.submissionDeadline).getTime() : Number.POSITIVE_INFINITY;
  const db = b.submissionDeadline ? new Date(b.submissionDeadline).getTime() : Number.POSITIVE_INFINITY;
  return da - db;
}

function toLink(tender: Tender): TenderLink | null {
  const item = toTenderListItem(tender);
  if (item.titleZh === PLACEHOLDER_TITLE) return null;
  return {
    id: item.id,
    publicSlug: item.publicSlug,
    titleZh: item.titleZh,
    country: item.country,
    industries: item.industries as IndustryKey[],
    relevanceTier: item.relevanceTier,
    status: item.status,
    scopeType: item.scopeType,
    isObrasPorImpuestos: item.isObrasPorImpuestos,
    ...(item.submissionDeadline ? { submissionDeadline: item.submissionDeadline } : {}),
    ...(item.deadlineInDocuments ? { deadlineInDocuments: true as const } : {}),
  };
}

function take(tenders: Tender[], limit: number): TenderLink[] {
  const links: TenderLink[] = [];
  for (const tender of tenders) {
    if (links.length >= limit) break;
    const link = toLink(tender);
    if (link) links.push(link);
  }
  return links;
}

/** Every live tender in one country, nearest deadline first — the country page's list. */
export function liveTenderLinksForCountry(all: Tender[], country: string, options: { limit?: number; now?: Date } = {}): TenderLink[] {
  return take(liveCandidates(all, [country], options.now ?? new Date()).sort(byDeadline), options.limit ?? Number.POSITIVE_INFINITY);
}

/** How many live tenders a country has, on the same basis as the list above. */
export function liveTenderCountForCountry(all: Tender[], country: string, now: Date = new Date()): number {
  return liveCandidates(all, [country], now).length;
}

/**
 * Up to three live tenders like this one, for the foot of its detail page.
 *
 * Same country always — a Mexican bidder reading a Mexican tender is not
 * helped by a Peruvian one. Within it, the most shared industries first
 * (「综合」 does not count as a match: it is the tag for "nothing matched"),
 * then the bigger tier, then the nearest deadline.
 */
export function relatedTenderLinks(all: Tender[], tender: Tender, options: { limit?: number; now?: Date } = {}): TenderLink[] {
  const own = new Set(tender.industries.filter((industry) => industry !== "general"));
  const shared = (other: Tender) => other.industries.filter((industry) => own.has(industry)).length;
  const candidates = liveCandidates(all, [tender.country], options.now ?? new Date())
    .filter((other) => other.id !== tender.id)
    .sort((a, b) => shared(b) - shared(a)
      || TIER_WEIGHT[b.relevance.tier] - TIER_WEIGHT[a.relevance.tier]
      || byDeadline(a, b));
  return take(candidates, options.limit ?? 3);
}

/**
 * Up to three live tenders published through the platform a guide explains
 * (Petronect, Cemig, SECOP II, …) — matched with the same buyer/source rule
 * the detail page uses to link a tender to its guide. Falls back to the
 * guide's country when that platform has nothing live today, and says which
 * of the two it returned so the heading can be honest about it.
 */
export function tenderLinksForGuide(
  all: Tender[],
  guide: { slug: string; countryKey: string },
  options: { limit?: number; now?: Date } = {},
): { links: TenderLink[]; scope: "platform" | "country" } {
  const limit = options.limit ?? 3;
  const candidates = liveCandidates(all, [guide.countryKey], options.now ?? new Date());
  const byTierThenDeadline = (a: Tender, b: Tender) => TIER_WEIGHT[b.relevance.tier] - TIER_WEIGHT[a.relevance.tier] || byDeadline(a, b);
  const fromPlatform = take(
    candidates.filter((tender) => participationGuideForTender(tender)?.slug === guide.slug).sort(byTierThenDeadline),
    limit,
  );
  if (fromPlatform.length > 0) return { links: fromPlatform, scope: "platform" };
  return { links: take(candidates.sort(byTierThenDeadline), limit), scope: "country" };
}

/** Up to three live tenders for a country insight page: biggest tier first, then nearest deadline. */
export function featuredTenderLinksForCountry(all: Tender[], country: string, options: { limit?: number; now?: Date } = {}): TenderLink[] {
  const candidates = liveCandidates(all, [country], options.now ?? new Date())
    .sort((a, b) => TIER_WEIGHT[b.relevance.tier] - TIER_WEIGHT[a.relevance.tier] || byDeadline(a, b));
  return take(candidates, options.limit ?? 3);
}
