/**
 * Derives the status a reader should see, from what the row stores plus the
 * calendar. Called from toTender() (lib/db/tenders.ts), so every surface —
 * public list, detail page, admin list, digest — shows the same answer
 * without each one re-deriving it.
 *
 * Derived rather than stored because the rules the user set on 2026-09-10
 * are time-dependent, and a stored status is only correct on the day it was
 * written:
 *
 *   1. 计划中 ("planned") is not used. Sources that report a planning stage
 *      (ocds-mapper maps OCDS `planning` to it) now read as 招标中.
 *   2. 澄清中 applies ONLY on the day of the clarification meeting itself.
 *      The complaint was that a junta de aclaraciones lasts one day, but
 *      the status stuck: a tender imported during its clarification window
 *      read 澄清中 for weeks afterwards, which told the reader the wrong
 *      thing about what they could still do.
 *   3. Anything else that has not closed reads 招标中.
 *
 * `awarded` and `cancelled` are terminal facts about the procurement, not
 * stages of an open one, so they always win. A passed submission deadline
 * closes a tender regardless of what the source last said — and so does a
 * passed validity_end, see rule 4.
 *
 *   4. A passed validity_end closes it too. PEMEX's Concurso Abierto is a
 *      standing invitation with an expiry (`vencimiento`), not a one-shot
 *      bid round, so it has no submission deadline to pass — and with only
 *      rule 3 to fall back on it read 招标中 forever. pemex-mapper's
 *      inferStatus() does look at vencimiento, but only at IMPORT time: the
 *      answer it writes is correct on the day of the import and frozen
 *      after it, so a row that expires between two imports never notices
 *      (user, 2026-09-12: 状态是不是会无限期停留在招标中？). Reading it here
 *      instead makes it a calendar question again, answered on every
 *      request, for rows already in the database — no re-import.
 *
   5. A tender with NO end date of any kind reads 已截止 45 days after it
 *      was published. Last resort, and only ever reached when rules 3 and 4
 *      have nothing to work with: no submission deadline, no validity_end,
 *      and no award (which would already have won at the top). That is the
 *      Peru OECE population — its records carry no end date at all, so
 *      nothing else can ever close them — plus any row whose source simply
 *      never supplied one.
 *
 *      This IS a guess, and the only one in this file. It is the third of
 *      three layers the user set (2026-09-12): read the real date out of
 *      the bases PDF first, fall back to the award appearing in the feed,
 *      and only then to the calendar. A wrong guess here costs a reader an
 *      opportunity that was still open; leaving these permanently 招标中
 *      costs every reader their trust in the status column, because a feed
 *      where a third of the rows are eternally "open" is not reporting
 *      anything. 45 days is the tunable part — see STALE_WITHOUT_END_DATE_DAYS.
 */
import type { Tender, TenderKeyDate, TenderStatus } from "@/types/tender";

/**
 * Statuses a reader can ever see, and the only ones offered as filters.
 * "planned" is deliberately absent — see rule 1 above.
 */
export const VISIBLE_TENDER_STATUSES: TenderStatus[] = [
  "open",
  "clarification",
  "submission_closed",
  "awarded",
  "cancelled",
];

/**
 * Calendar day in the platform's business timezone. Mexico City is UTC-6
 * year-round (DST abolished in 2022) and every tender here is Mexican or
 * Colombian, so "the day of the meeting" means the day it is where the
 * meeting happens — not on the server, and not in the reader's browser.
 */
const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function platformDay(value: string | number | Date): string | null {
  // A bare YYYY-MM-DD is ALREADY a calendar day and has no time of day to
  // convert, so it is returned untouched.
  //
  // Without this it was converted anyway, and every one of it shifted a day
  // EARLIER (found 2026-09-12 while testing the validity_end rule): every
  // date this function is given from the database is a `date` column —
  // submission_deadline, award_date, tender_key_dates.date are all `date`
  // in 0001_init — and PostgREST returns those as "2026-09-12", which
  // `new Date()` reads as UTC midnight, which is 18:00 the PREVIOUS day in
  // Mexico City.
  //
  // Two live rules were off by exactly one day because of it. A tender read
  // 已截止 on the morning of its own deadline — the precise thing the
  // comment below says must not happen — and 澄清中 showed on the day
  // before the junta de aclaraciones and never on the day itself.
  if (typeof value === "string") {
    const bareDay = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
    if (bareDay) return bareDay[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DAY_FORMATTER.format(date);
}

/**
 * How long a tender with no end date of any kind stays 招标中 (rule 5).
 *
 * Not derived from anything — a real number would need a measured
 * publication-to-close distribution per source, which this platform does not
 * have. Chosen to sit past the usual run of these procedures rather than at
 * the middle of it, so the rule closes a stale row late rather than closing
 * a live one early. Raise it if real projects start disappearing while still
 * open; lower it if the feed fills with rows that closed weeks ago.
 */
export const STALE_WITHOUT_END_DATE_DAYS = 45;

function daysBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDay}T00:00:00.000Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.floor((to - from) / 86_400_000);
}

export function deriveTenderStatus(
  stored: TenderStatus,
  fields: {
    submissionDeadline?: string | null;
    /** Needed for rule 5 only. Absent (mock data, a partial row) simply means rule 5 cannot fire. */
    publicationDate?: string | null;
    keyDates?: Pick<TenderKeyDate, "type" | "date">[];
  },
  now: Date = new Date(),
): TenderStatus {
  if (stored === "awarded" || stored === "cancelled") return stored;

  const today = platformDay(now);
  const deadlineDay = fields.submissionDeadline ? platformDay(fields.submissionDeadline) : null;
  // Compared as day strings, not timestamps: a deadline at 14:00 today has
  // not closed the tender for a reader looking at it in the morning, and a
  // date-only deadline column has no time of day to compare against anyway.
  if (today && deadlineDay && deadlineDay < today) return "submission_closed";

  // Same day-string comparison, same reason. Only closes the tender once the
  // validity window is genuinely in the past — never used to OPEN one, so a
  // source that reports awarded/cancelled still wins above.
  const validityEndDay = (fields.keyDates ?? [])
    .filter((keyDate) => keyDate.type === "validity_end")
    .map((keyDate) => platformDay(keyDate.date))
    .find((day): day is string => day !== null);
  if (today && validityEndDay && validityEndDay < today) return "submission_closed";

  const clarifiesToday = (fields.keyDates ?? []).some(
    (keyDate) => keyDate.type === "clarification" && today && platformDay(keyDate.date) === today,
  );
  if (clarifiesToday) return "clarification";

  // Rule 5, last. Deliberately below the clarification check: a junta de
  // aclaraciones happening TODAY is direct evidence the procedure is live,
  // and no calendar guess should be able to overrule it.
  //
  // "No end date of any kind" is the whole precondition — a deadline or a
  // validity_end that has not passed yet returned "open" above only because
  // the tender is genuinely still running, and must not be second-guessed
  // here.
  const hasAnyEndDate = deadlineDay !== null || validityEndDay !== undefined;
  const publishedDay = fields.publicationDate ? platformDay(fields.publicationDate) : null;
  if (!hasAnyEndDate && today && publishedDay && daysBetween(publishedDay, today) > STALE_WITHOUT_END_DATE_DAYS) {
    return "submission_closed";
  }

  return "open";
}

/** Convenience wrapper for a fully-built Tender. */
export function tenderDisplayStatus(tender: Tender, now?: Date): TenderStatus {
  return deriveTenderStatus(tender.status, tender, now);
}
