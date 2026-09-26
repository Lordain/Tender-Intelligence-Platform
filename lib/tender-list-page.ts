import type { Tender, TenderRelevanceTier, TenderScopeType, TenderStatus } from "@/types/tender";
import { ALL_INDUSTRIES, type IndustryKey } from "@/lib/industry";
import { ALL_SCOPE_TYPES } from "@/lib/tender-labels";
import { filterTenders, isSortKey, sortTenders } from "@/lib/filter-tenders";
import { requirePublicTenderSlug } from "@/lib/public-tender-url";
import { estimatedValueBand, toMonthPrecisionOptional } from "@/lib/public-redaction";
import { undisclosedAmountBand } from "@/lib/chile-amount-band";
import { publicTitleOf, shortTitleOf } from "@/lib/public-title";
import { isObrasPorImpuestos } from "@/lib/obras-por-impuestos";
import { deadlineIsInDocuments } from "@/lib/deadline-in-documents";

export const TENDER_PAGE_SIZE = 20;
// 暂停中 is shown by default (migration 0057): a paused tender is one a reader
// is likely following, and it may resume. 流标 is not — the round is over.
export const DEFAULT_TENDER_LIST_STATUSES: TenderStatus[] = ["planned", "open", "clarification", "suspended", "awarded"];

/**
 * Statuses a bidder can still act on — now only the 5天内交标 gate.
 *
 * It used to be what the sidebar's first cell counted, under the label
 * 全站在招. That cell is 全站项目 as of 2026-09-20 and counts the whole
 * public catalogue, so this list has nothing to do with it any more: a
 * deadline five days out only means something while the tender is still
 * live, which is the one question these three statuses are left answering.
 */
export const LIVE_TENDER_STATUSES: TenderStatus[] = ["planned", "open", "clarification"];

/** What 当前在招 subtracts from 全站项目, in the user's own words: 扣除已截止、已取消、已中标. */
// 暂停中 and 流标 (migration 0057) are not biddable either: nobody can submit
// to a paused or a deserted procedure today.
const NOT_LIVE_STATUSES: TenderStatus[] = ["submission_closed", "cancelled", "awarded", "suspended", "deserted"];

/**
 * 最近新增 is a ROLLING 24 hours, not the calendar day.
 *
 * Mexican sources publish in the evening, so a calendar-day counter spent
 * most of its life at or near zero and only filled up at night — and then
 * reset at midnight, throwing the number away a few hours after it finally
 * meant something. The user watching it (2026-09-15) saw exactly that: a
 * figure that "只有晚上看得到，然后一下子又刷新了".
 *
 * A rolling window costs nothing and is what the label was always trying to
 * say: what arrived since about this time yesterday. It also removes the
 * timezone question entirely — a duration needs no calendar — so the reader
 * no longer has to know the count is kept on Mexico City's clock rather than
 * their own.
 *
 * Measured from createdAt, the ingestion instant (a timestamptz), NOT from
 * publication_date: two of the Mexican mappers fabricate a publication date
 * when the source carries none, so publication date answers "when did the
 * government publish this" only sometimes, while createdAt always answers
 * "when did this appear on the site" — which is the question 新增 asks.
 */
const RECENTLY_ADDED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The 招标概览 deadline card is intentionally a short action window, not a
 * count of every tender with any future deadline. Five rolling days keeps the
 * number useful throughout the day and matches the list opened by the card.
 */
export const UPCOMING_DEADLINE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Countries the public list offers as a filter — and, because an absent
 * country param means "all of these", the countries the default feed shows
 * AT ALL. A country missing from this list is invisible on /tenders no matter
 * how many of its tenders are in the database, which is exactly what happened
 * to Peru between its first import and 2026-09-11.
 *
 * So this is the switch that turns a country on for users, and it belongs
 * next to a real connector: ALL_COUNTRIES (lib/tender-labels.ts) also carries
 * Chile, which has no source yet and would only ever return zero.
 *
 * Brazil was added 2026-09-19. Its PNCP connector had been importing since
 * 2026-09-16 and every one of those rows was invisible on /tenders — the same
 * failure Peru had between its first import and 2026-09-11, which is what
 * this comment was written about the first time. A connector that ships
 * without its entry here produces a database full of tenders nobody can see.
 *
 * The ORDER is the user's (2026-09-19: 墨西哥、巴西、哥伦比亚、秘鲁) and it is
 * the display order too — TenderExplorer maps these pills straight off this
 * array, so sorting here is sorting in the UI.
 *
 * Exported because TenderExplorer draws the filter pills from the very same
 * list: two copies would let the pills and the server-side filter disagree,
 * and the failure mode of that is a country a user can tick but never see.
 */
// Chile added last, 2026-09-25, when the user opened it after the Chilean
// filters were tuned (智利筛选调好 → 现在开放).
export const AVAILABLE_COUNTRIES = ["Mexico", "Brazil", "Colombia", "Peru", "Chile"] as const;

export type TenderListSearchParams = Record<string, string | string[] | undefined>;

/**
 * Only fields rendered by a list card/reminder; full tender detail never
 * crosses this page boundary. In particular, the original-language title is
 * deliberately replaced by one safe Chinese display string before the data
 * reaches the browser.
 */
export type TenderListItem = Pick<
  Tender,
  | "id"
  | "country"
  | "industries"
  | "status"
  | "currency"
  | "submissionDeadline"
  /**
   * The two facts the list already filters on but never showed on a row
   * (user, 2026-09-20: 项目卡片上面增加项目规模标签、项目类型标签).
   *
   * Neither is new information reaching a guest. 项目规模 and 项目类型 are
   * both public filter controls on this very page, so anyone could already
   * read a tender's tier and scope by narrowing to one value and seeing
   * whether the row survived. Rendering them saves the round trip; it does
   * not widen what is knowable. The tier in particular is a BAND
   * (大型/中型/常规), never the budget — the exact figure is still
   * member-only, a few lines below.
   */
  | "scopeType"
> & {
  /** Just the tier — `relevance` also carries the reason text, which names the rule and is an admin-facing string. */
  relevanceTier: Tender["relevance"]["tier"];
  /**
   * Obras por Impuestos is different enough from an ordinary tender that
   * finding out only after opening the detail page wastes the click.
   *
   * Carried as the answer rather than as the `sourceName` it is computed
   * from (2026-09-19): the source name tells a reader which portal to go
   * and search, and knowing where to look is most of what they subscribe
   * for. Nothing public rendered the name itself.
   */
  isObrasPorImpuestos: boolean;
  /** The bid date is in the bid documents (lib/deadline-in-documents.ts): show 见招标文件, not 未提供. */
  deadlineInDocuments?: true;
  publicSlug: string;
  titleZh: string;
  buyer?: string;
  /** The exact budget — members only. Absent for guests; see estimatedValueBand. */
  estimatedValue?: number;
  /**
   * Present instead of `estimatedValue` for a guest or a lapsed free
   * account: the USD range containing the budget rather than the budget.
   * Exactly one of the two is ever set — see toTenderListItem.
   */
  estimatedValueBand?: string | null;
  /** Every audience: the USD range a Chilean buyer published instead of an amount. See lib/chile-amount-band.ts. */
  undisclosedValueBand?: string;
};

export type TenderListPageData = {
  tenders: TenderListItem[];
  totalResults: number;
  totalPages: number;
  currentPage: number;
  /**
   * Industry filter options, narrowed to the categories that actually have
   * tenders behind them right now.
   *
   * The taxonomy (ALL_INDUSTRIES) is aspirational — it carries tax, mining,
   * education and others that government procurement in these countries
   * either never tenders or that this platform's own exclude rules remove
   * on purpose. Offering all of them made most of the filter dead: every
   * click returned zero and read as a broken site rather than an empty
   * category (2026-09-11, user: 很多行业一个项目都没有).
   *
   * Computed from the UNFILTERED list, so choosing an industry never makes
   * its own checkbox disappear, and it reappears by itself the day a source
   * starts supplying that category — no hardcoded hide list to maintain.
   */
  availableIndustries: IndustryKey[];
  /**
   * Same reasoning as availableIndustries, for the 项目类型 filter: two of the
   * five scope types effectively never reach the feed (see ALL_SCOPE_TYPES),
   * and a checkbox that can only ever return nothing is worse than no
   * checkbox. Derived, not a hide list, so a hand-set or override-rescued
   * tender brings its option back by itself.
   */
  availableScopeTypes: TenderScopeType[];
  /**
   * Country filter options, narrowed to the countries that have a publicly
   * visible tender behind them right now.
   *
   * AVAILABLE_COUNTRIES stays the allowlist and the display order — a
   * country still needs a real connector to appear at all. This is that
   * list minus the countries whose rows are, today, all screened out.
   *
   * Brazil is why (user, 2026-09-20: 巴西前台如果现在看到的项目数 = 0，就先
   * 隐藏这个国家，如果 > 0 就展示). A connector can be importing every day
   * while every row it writes lands in the excluded tier, and a country pill
   * that can only ever return zero reads as a broken site rather than as an
   * empty country — the same complaint that produced availableIndustries.
   *
   * Derived, not a hide list: the pill comes back by itself the day one
   * Brazilian tender survives the filter, with nothing to remember to undo.
   */
  availableCountries: (typeof AVAILABLE_COUNTRIES)[number][];
  /**
   * Every tender on the site a visitor could reach, ignoring the viewer's
   * filters — the sidebar's 全站项目. Deliberately on a different basis from
   * newTodayCount/upcomingCount, which are scoped to the current filters
   * because clicking them filters the list to exactly that set.
   *
   * Two things it used to get wrong (2026-09-12):
   * - It counted `allTenders` raw, so every excluded-tier row was in the
   *   total. Those rows are screened out of every public surface by
   *   filterTenders — the site was advertising a catalogue including
   *   thousands of tenders no user can reach.
   * - It subtracted only awarded + cancelled, while the default feed INCLUDES
   *   awarded (DEFAULT_TENDER_LIST_STATUSES), so 当前结果 could legitimately
   *   come out LARGER than the site total sitting next to it.
   *
   * Now it runs the same filterTenders() gate the feed does, so it is always
   * a superset of totalResults on the status dimension and can never be
   * undercut by it.
   *
   * It stopped being the LIVE slice on 2026-09-20 (user: 把全站在招改成全站
   * 项目，因为在招把已截止都算入了). It never did count 已截止 — the three
   * LIVE_TENDER_STATUSES are what it summed. But printed beside a 当前结果 of
   * the same size, on a feed whose default preset shows 已中标 too, 在招 read
   * as a claim about what was IN the number rather than as a narrower count
   * beside a wider one. Wording cannot fix both readings at once, so the cell
   * now counts what its new label says: the catalogue. 全站项目 is a superset
   * of 当前结果 on every dimension, not just on status — which is the one
   * relationship a visitor checks between two numbers printed side by side.
   *
   * The excluded tier is still out, as on every public surface: those rows
   * are unreachable through any filter combination, and counting them would
   * advertise a catalogue nobody can open.
   */
  siteTenderCount: number;
  /**
   * 当前在招 (user, 2026-09-25): 全站项目 minus 已截止, 已取消 and 已中标 —
   * the same catalogue basis as siteTenderCount, so the two read as a whole
   * and a part of it.
   */
  liveTenderCount: number;
  newTodayCount: number;
  upcomingCount: number;
};

/**
 * One list row, projected for the audience that will receive it.
 *
 * `memberView` is a single flag rather than one per field on purpose: every
 * difference between what a subscriber and a visitor may see on this list is
 * decided here, from one boolean derived from one call to
 * canUseTenderListMemberFeatures(). Two independent options would eventually
 * be passed inconsistently by some third call site, and the failure mode of
 * that mistake is silent — a page that looks right while serving protected
 * values into its own HTML.
 *
 * It defaults to false so a new caller redacts by default. The saved-
 * reminders route was exactly that caller: it had no entitlement check at
 * all, and defaulting the other way would have kept it leaking.
 */
export function toTenderListItem(
  tender: Tender,
  options: { memberView?: boolean } = {},
): TenderListItem {
  const memberView = options.memberView ?? false;
  const translatedTitle = tender.title.zh.trim();
  const originalTitle = tender.title.es.trim();

  return {
    id: tender.id,
    publicSlug: requirePublicTenderSlug(tender),
    // Some unreviewed rows temporarily copy the source title into `zh`.
    // Treat those as untranslated rather than leaking the original title.
    // A member reads the condensed title — place, asset and works type, with
    // the procurement shell removed; everyone else reads the de-identified
    // one, which keeps the industry and works keywords and drops the place,
    // the agency and the procurement code. Neither is the raw translation:
    // that stays in title.zh for the admin screens and as the input this pass
    // regenerates from, and is no longer rendered anywhere on the front end.
    titleZh: translatedTitle && translatedTitle !== originalTitle
      ? (memberView ? shortTitleOf(tender) : publicTitleOf(tender))
      : memberView ? `${tender.buyer}采购项目` : "政府采购项目",
    ...(memberView ? { buyer: tender.buyer } : {}),
    country: tender.country,
    industries: tender.industries,
    status: tender.status,
    scopeType: tender.scopeType,
    // The tier alone, not the whole `relevance` object: that carries
    // `reason`, a paragraph written for the admin screens that names the
    // rule and its thresholds by number.
    relevanceTier: tender.relevance.tier,
    // The exact figure for a member, a band for everyone else. An exact
    // budget is the single most identifying value a tender carries — it
    // matches one row worldwide — so it never reaches a page that a crawler
    // or a logged-out visitor can read.
    ...(memberView
      ? { estimatedValue: tender.estimatedValue }
      : { estimatedValueBand: estimatedValueBand(tender.estimatedValue, tender.currency) }),
    undisclosedValueBand: undisclosedAmountBand(tender)?.usd,
    currency: tender.currency,
    submissionDeadline: memberView
      ? tender.submissionDeadline
      : toMonthPrecisionOptional(tender.submissionDeadline),
    isObrasPorImpuestos: isObrasPorImpuestos(tender),
    ...(deadlineIsInDocuments(tender) ? { deadlineInDocuments: true as const } : {}),
  };
}

/**
 * One notification row for the header bell, projected for its audience.
 *
 * Lives here rather than in the route so it is testable beside the two
 * projections it shares a rule with — and so the rule itself is written once.
 * The route used to inline `title: tender.title`, shipping the whole
 * LocalizedText: every item carried `title.es`, the original Spanish or
 * Portuguese name of the project, on an endpoint with no authentication, in
 * batches of fifty (2026-09-20). The bell has only ever rendered the Chinese,
 * so nothing displayed changes.
 */
export type NotificationTenderItem = {
  id: string;
  publicSlug: string;
  titleZh: string;
  publicationDate: string;
  createdAt: string;
};

export function toNotificationTender(
  tender: Tender,
  options: { memberView?: boolean } = {},
): NotificationTenderItem {
  const memberView = options.memberView ?? false;
  const translatedTitle = tender.title.zh.trim();
  const originalTitle = tender.title.es.trim();
  // Same rule as toTenderListItem: an unreviewed row mirrors the source text
  // into `zh` until the translation job runs, and publishing that would hand
  // over the original title under a different field name.
  const hasRealTranslation = translatedTitle !== "" && translatedTitle !== originalTitle;
  return {
    id: tender.id,
    publicSlug: requirePublicTenderSlug(tender),
    titleZh: hasRealTranslation
      ? (memberView ? shortTitleOf(tender) : publicTitleOf(tender))
      : memberView ? `${tender.buyer}采购项目` : "政府采购项目",
    publicationDate: tender.publicationDate,
    createdAt: tender.createdAt,
  };
}

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function parseList(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

/**
 * Applies the public list's search, facets, views, sorting and pagination on
 * the server. The underlying shared list stays cached for five minutes, but
 * only the current 20-row page is serialized into the browser's React
 * payload. Discovery is public; protected analysis stays behind the detail
 * page entitlement boundary.
 */
export function buildTenderListPage(
  allTenders: Tender[],
  params: TenderListSearchParams,
  options: { now?: Date; pageSize?: number; memberView?: boolean; memberCountry?: string | null; searchPublicFieldsOnly?: boolean } = {},
): TenderListPageData {
  const now = options.now ?? new Date();
  const pageSize = options.pageSize ?? TENDER_PAGE_SIZE;
  const query = firstValue(params.q) ?? "";
  const countryParam = firstValue(params.country);
  const countries = countryParam ? parseList(countryParam) : [...AVAILABLE_COUNTRIES];
  const industries = parseList(firstValue(params.industry));
  const industryMatchMode = firstValue(params.industryMode) === "all" ? "all" : "any";
  const scopeTypes = parseList(firstValue(params.scope)) as TenderScopeType[];
  const statusParam = firstValue(params.status);
  const statuses = (statusParam === "none"
    ? []
    : statusParam !== null
      ? parseList(statusParam)
      : DEFAULT_TENDER_LIST_STATUSES) as TenderStatus[];
  const tierParam = firstValue(params.tier);
  const relevanceTiers = (tierParam === "none" ? [] : parseList(tierParam)) as TenderRelevanceTier[];
  const sortParam = firstValue(params.sort);
  const sort = isSortKey(sortParam) ? sortParam : "deadline_asc";
  const viewParam = firstValue(params.view);
  const view = viewParam === "new" || viewParam === "deadline" ? viewParam : null;

  const filtered = filterTenders(
    allTenders,
    { query, searchPublicFieldsOnly: options.searchPublicFieldsOnly, industries, industryMatchMode, scopeTypes, statuses, countries, relevanceTiers },
    "zh",
  );
  // Every row a visitor could reach through SOME combination of filters:
  // the whole table minus the excluded tier, which no public surface
  // renders. All three facet lists and the site total are computed off this
  // one set — a facet derived from the raw table can offer a value that only
  // excluded rows carry, and clicking it returns zero.
  //
  // Deliberately NOT `filtered`: a facet computed from the current result
  // set would delete its own option the moment you ticked it.
  const visibleTenders = filterTenders(allTenders, {}, "zh");
  const presentIndustries = new Set(visibleTenders.flatMap((tender) => tender.industries));
  const availableIndustries = ALL_INDUSTRIES.filter((industry) => presentIndustries.has(industry));
  const presentScopeTypes = new Set(visibleTenders.map((tender) => tender.scopeType));
  const availableScopeTypes = ALL_SCOPE_TYPES.filter((scopeType) => presentScopeTypes.has(scopeType));
  const presentCountries = new Set(visibleTenders.map((tender) => tender.country));
  const availableCountries = AVAILABLE_COUNTRIES.filter((country) => presentCountries.has(country));

  const nowMs = now.getTime();
  const isRecentlyAdded = (tender: Tender) => {
    const added = new Date(tender.createdAt).getTime();
    return Number.isFinite(added) && nowMs - added < RECENTLY_ADDED_WINDOW_MS && added <= nowMs;
  };
  const newTodayCount = filtered.filter(isRecentlyAdded).length;
  const isUpcomingDeadline = (tender: Tender) => {
    if (!LIVE_TENDER_STATUSES.includes(tender.status) || !tender.submissionDeadline) return false;
    const deadline = new Date(tender.submissionDeadline).getTime();
    return Number.isFinite(deadline)
      && deadline >= nowMs
      && deadline <= nowMs + UPCOMING_DEADLINE_WINDOW_MS;
  };
  const upcomingCount = filtered.filter(isUpcomingDeadline).length;

  const viewed = view === "new"
    ? filtered.filter(isRecentlyAdded)
    : view === "deadline"
      ? filtered.filter(isUpcomingDeadline)
      : filtered;
  const sorted = sortTenders(viewed, sort, nowMs);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const requestedPage = Math.max(1, Number(firstValue(params.page)) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * pageSize;

  return {
    tenders: sorted
      .slice(offset, offset + pageSize)
      .map((tender) => toTenderListItem(tender, { memberView: options.memberView && (!options.memberCountry || tender.country === options.memberCountry) })),
    totalResults: sorted.length,
    totalPages,
    currentPage,
    availableIndustries,
    availableScopeTypes,
    availableCountries,
    siteTenderCount: visibleTenders.length,
    liveTenderCount: visibleTenders.filter((tender) => !NOT_LIVE_STATUSES.includes(tender.status)).length,
    newTodayCount,
    upcomingCount,
  };
}
