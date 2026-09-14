import type { TenderKeyDate } from "@/types/tender";

/**
 * Reads a Mexican tender's bid deadline off the opening date it already has.
 *
 * Why this is sound, and only in Mexico: LAASSP and LOPSRM schedule handing
 * the proposals in and opening them as ONE session — the "acto de
 * presentación y apertura de proposiciones". A bidder who is not there with
 * a sealed proposal at that hour is out, so the act IS the deadline. This is
 * the same fact the document-extraction prompt was taught on 2026-09-13
 * (emit both a "submission" and an "opening" entry for that one row); this
 * function is how the tenders analysed BEFORE that lands get their deadline
 * without re-reading a single PDF.
 *
 * The trap it exists to avoid: a two-envelope procedure opens the technical
 * proposals at that first act and the economic ones days later, as its own
 * session. Real case behind dof-search-mapper.ts's own note —
 * CFE-0001-CAAAT-0134-2026, técnica 11/09 and económica 18/09. Both rows are
 * type "opening". Taking the económica would publish a deadline a week after
 * the real one closed, which is the single worst thing this platform can
 * print, so an economic opening never supplies a deadline: it is skipped,
 * and a tender that has nothing else is reported as having no basis rather
 * than filled from it.
 *
 * Never a substitute for the real thing. It fills a column that is empty; a
 * deadline from the source, a document or an admin always wins.
 */
export type OpeningRow = Pick<TenderKeyDate, "type" | "date"> & {
  notes?: { es?: string; en?: string; zh?: string } | null;
};

export type DeadlineFromOpening =
  | { ok: true; date: string; basis: string }
  | { ok: false; reason: "no_opening" | "economic_only" };

/** "Apertura de ofertas económicas" / 商务标开标 — the SECOND session, days after the deadline. */
const ECONOMIC_OPENING = /econ[óo]mic|商务标/i;

function noteText(row: OpeningRow): string {
  return [row.notes?.es, row.notes?.en, row.notes?.zh].filter(Boolean).join(" ");
}

export function deadlineFromOpening(rows: readonly OpeningRow[]): DeadlineFromOpening {
  const openings = rows.filter((row) => row.type === "opening" && !!row.date);
  if (openings.length === 0) return { ok: false, reason: "no_opening" };

  const usable = openings.filter((row) => !ECONOMIC_OPENING.test(noteText(row)));
  if (usable.length === 0) return { ok: false, reason: "economic_only" };

  // Earliest wins: where a procedure holds more than one opening, proposals
  // are handed in at the first of them.
  const earliest = [...usable].sort((a, b) => a.date.localeCompare(b.date))[0];
  return { ok: true, date: earliest.date, basis: noteText(earliest) || "apertura de proposiciones" };
}
