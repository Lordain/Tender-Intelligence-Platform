import { platformDay } from "@/lib/tender-status";
import type { Tender } from "@/types/tender";

/**
 * Real government exports routinely carry years of history in one file
 * (a PEMEX SharePoint list, a Datos Abiertos CSV, a DOF search result) —
 * far more than a Chinese enterprise deciding what to bid on next needs
 * to see. Filtering to the last `months` keeps ingestion focused on
 * current opportunities without the platform having to build separate
 * date-range logic per source.
 *
 * Filters on publicationDate specifically (not submissionDeadline, which
 * historical/awarded rows often lack) — every mapper already guarantees
 * publicationDate is a valid, non-empty ISO string before a row becomes a
 * Tender, so this only needs to compare against the cutoff.
 *
 * KNOWN BLIND SPOT, and the reason isPastSubmissionDeadline() below exists
 * (found 2026-09-13 from the admin list): "every mapper guarantees a valid
 * publicationDate" is true and is not the same as "every mapper has one".
 * A source with no publication-date column falls back to the ingestion
 * timestamp and sets publicationDateIsEstimated — LicitIA's vigente rows
 * with no `publicacion`, Compras MX's manual export, which has no such
 * column at all. That date is always today, so those rows pass EVERY
 * window this function will ever be given, however narrow. A whole import
 * batch showed up stamped 发布 2026-09-09 估 with 交标 dates in 2023 and
 * 2024, and no value of `months` could have stopped it.
 *
 * This function is not the place to fix that — an estimated publication
 * date is genuinely unknown, not wrong, and guessing at it would throw away
 * live tenders from the sources that have no such column. The deadline is
 * the field that actually answers "is this still worth showing", so that is
 * what gates the write.
 */
export function filterRecentTenders(tenders: Tender[], months: number, now: Date = new Date()): Tender[] {
  if (months <= 0) return tenders;

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffTime = cutoff.getTime();

  return tenders.filter((tender) => new Date(tender.publicationDate).getTime() >= cutoffTime);
}

/**
 * Same filter, in days rather than months.
 *
 * Added 2026-09-11 at the user's request: once a country's rules are settled,
 * a re-import should bring in only what is genuinely new, because the
 * expensive part of an import is not the fetch, it is a human reading several
 * hundred fresh rows. Peru's OECE segments hold a whole calendar month each,
 * so "the last 5 days" is not expressible in months at all.
 *
 * Deliberately a separate function rather than fractional months: `months`
 * arithmetic goes through setMonth(), which clamps day-of-month (31 March
 * minus one month is 3 March, not 28 February), and a day count has no
 * business inheriting that.
 */
export function filterTendersPublishedWithinDays(tenders: Tender[], days: number, now: Date = new Date()): Tender[] {
  if (days <= 0) return tenders;
  const cutoffTime = now.getTime() - days * 24 * 60 * 60 * 1000;
  return tenders.filter((tender) => new Date(tender.publicationDate).getTime() >= cutoffTime);
}

/**
 * True when a tender's bid deadline has already passed — nothing a bidder
 * can act on, and the thing the user found repeatedly in the admin list
 * (2026-09-13: "很多交标截止的都加了进来", "还有交标时间2024年的项目").
 *
 * Two ways a closed tender got in, and neither is a window that was set too
 * wide:
 *
 * - A row whose publication date is estimated is invisible to
 *   filterRecentTenders (see above), so its real age never mattered.
 * - A row published well inside the window can still close before the
 *   import runs. Colombia's deadlines sit roughly a month after
 *   publication, and datos.gov.co lags the portal by days, so a nightly
 *   run at a one-month window legitimately meets rows whose deadline was
 *   last week.
 *
 * Uses platformDay() rather than raw Date comparison for the reason that
 * function documents: these are `date` values, and comparing them as
 * instants closes a tender on the morning of its own deadline. A tender due
 * TODAY is still open, which is the same rule deriveTenderStatus() applies
 * to what the site displays — an import that disagreed with the site about
 * the same tender would be its own bug.
 *
 * `awarded` is deliberately exempt: its deadline has passed by definition,
 * and the award result is the point of keeping it (the public award-result
 * section exists for these). Filtering on the deadline alone would delete
 * the entire awarded population.
 */
export function isPastSubmissionDeadline(
  tender: Pick<Tender, "submissionDeadline" | "status">,
  now: Date = new Date(),
): boolean {
  if (tender.status === "awarded") return false;
  if (!tender.submissionDeadline) return false;
  const deadline = platformDay(tender.submissionDeadline);
  const today = platformDay(now);
  if (!deadline || !today) return false;
  return deadline < today;
}

/** 12 个自然日 — the user's number (2026-09-19), calendar days and not working days. */
export const SHORT_BID_WINDOW_DAYS = 12;

/**
 * A bidding window too short for a foreign company to enter.
 *
 * The user's rule, verbatim: 常规项目(没有金额的)，如果有交标日期，而且交标日期
 * 减 发布日期小于12个自然日，就自动被排除，也应用于所有国家的项目.
 *
 * The reasoning is about mobilisation, not about scale. A Chinese enterprise
 * bidding in Latin America has to read the edital in Portuguese or Spanish,
 * price it, arrange a bid bond, and in most of these systems register with the
 * platform first. Under twelve calendar days that is not a competition a
 * foreign bidder can enter, whatever the notice is worth — which is the same
 * observation the `price_comparison` exclusion already makes about Peru's
 * abbreviated procedure ("从公告到授标通常只有几天").
 *
 * ── Why it lives HERE and not in lib/relevance.ts ─────────────────────────
 *
 * Because classifyRelevance() has no dates, and giving it two would mean
 * threading them through nineteen mappers. That file states the hazard in its
 * own words: a signal a mapper forgets to pass is "right at import and wrong
 * forever after" — and it is not hypothetical, it is the 193 → 486 jump of
 * 2026-09-08. upsertTendersBatched() is the one line every import path passes
 * through, cron, CLI and admin button alike, which is exactly why the
 * past-deadline gate was put there and the same reason applies unchanged.
 *
 * ── The four guards, each load-bearing ────────────────────────────────────
 *
 * `standard` only: the user scoped it to 常规项目. A 中型 or 大型 row with a
 * short window is a real opportunity someone may still want to see.
 *
 * No disclosed amount: 没有金额的. With a value in hand the tender has already
 * been sized on something better than a calendar.
 *
 * A REAL publication date. `publicationDateIsEstimated` means the date is the
 * moment this platform first saw the row, not when the entity published it —
 * Compras MX and PEMEX rows are like this. Measuring a window from an ingest
 * timestamp would reject rows for the crime of having been imported late, and
 * would do it to whole sources at once.
 *
 * A parseable deadline: 如果有交标日期. No deadline, no window, no verdict.
 */
export function hasShortBidWindow(
  tender: Pick<
    Tender,
    "publicationDate" | "publicationDateIsEstimated" | "submissionDeadline" | "estimatedValue" | "relevance"
  >,
): boolean {
  if (tender.relevance.tier !== "standard") return false;
  if (tender.estimatedValue !== undefined) return false;
  if (tender.publicationDateIsEstimated === true) return false;
  if (!tender.submissionDeadline) return false;
  const published = platformDay(tender.publicationDate);
  const deadline = platformDay(tender.submissionDeadline);
  if (!published || !deadline) return false;
  const days = calendarDaysBetween(published, deadline);
  if (days === null) return false;
  return days < SHORT_BID_WINDOW_DAYS;
}

/**
 * Whole calendar days from one YYYY-MM-DD to another, or null if either is
 * unparseable.
 *
 * Built from the date PARTS rather than from Date.parse, because platformDay
 * returns a calendar day and parsing one as an instant is the exact bug its
 * own header documents — every value shifting a day earlier in a UTC-minus
 * timezone. Date.UTC on the parts has no timezone to be wrong about.
 */
function calendarDaysBetween(fromDay: string, toDay: string): number | null {
  const parse = (day: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const from = parse(fromDay);
  const to = parse(toDay);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86_400_000);
}
