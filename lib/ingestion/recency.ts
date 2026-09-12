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
