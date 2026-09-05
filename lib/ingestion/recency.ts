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
