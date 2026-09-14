import { KEY_DATE_TYPE_LABELS } from "@/lib/tender-labels";
import type { TenderKeyDate } from "@/types/tender";

/**
 * Reads a cronograma the model pulled out of a bid document and says which
 * parts of it cannot be true.
 *
 * The gap this closes: toCalendarDay() (extract-requirements.ts) already
 * rejects anything that isn't a real calendar day, and that was the only
 * check a key date had. But the failure that actually costs a customer a
 * bid is the one toCalendarDay cannot see — a date that IS a real day and
 * is the wrong one. Every country this platform reads writes 10/09/2026 for
 * 10 September; a model that reads that as 9 October produces "2026-10-09",
 * a perfectly valid day which then silently becomes the tender's 交标截止日
 * (lib/db/extracted-key-dates.ts fills the column from it).
 *
 * There is no second source to check that date against — for Peru the
 * document IS the only source (migration 0045) — so the only evidence
 * available is the schedule's own internal consistency. That turns out to
 * be enough for the swap case specifically: swapping a day and a month
 * moves one row of the cronograma and leaves the rest where they were, so
 * it lands the bid deadline after the opening, or the award before the bids
 * are even due.
 *
 * What is deliberately NOT checked, because the check would fire on correct
 * answers — the defect found twice in the translation checkers (2026-09-12),
 * where a warning on a right answer teaches the reader to ignore the
 * warning:
 *
 * - "every row falls on the same day" looks like a mis-read table and is
 *   not: a Peruvian Adjudicación Simplificada routinely holds presentación,
 *   apertura and otorgamiento de la buena pro on one day.
 * - "questions_deadline before clarification" is the usual order but not a
 *   required one — further consultas can be raised at the junta itself and
 *   answered in a second session. Same for site_visit against either: those
 *   three are scheduled around each other, not in a fixed sequence. Only
 *   their position relative to the bid deadline is fixed, which is exactly
 *   what RANK below encodes by giving all three the same rank.
 * - "the deadline has already passed" is not a defect at all. This platform
 *   imports documents for tenders that have since closed.
 */

/** Exported as ExtractedKeyDateType for seace-cronograma.ts, which produces exactly this set. */
export type ExtractedType = Exclude<TenderKeyDate["type"], "publication" | "validity_end">;
export type { ExtractedType as ExtractedKeyDateType };

/**
 * Where each row sits in the one ordering a procurement procedure cannot
 * violate. Equal ranks are never compared against each other, which is how
 * the three pre-bid events stay unordered among themselves while still
 * being required to precede the deadline.
 */
const RANK: Record<ExtractedType, number> = {
  site_visit: 1,
  questions_deadline: 1,
  clarification: 1,
  submission: 2,
  opening: 3,
  award: 4,
  contract_signing: 5,
};

/**
 * A cronograma row more than a year past the publication date is not a
 * schedule, it is a misread year (2026 -> 2028) or a date lifted from the
 * contract's own duration. A year is generous on purpose: a large obra can
 * genuinely have its award months out, and this must not fire on one.
 */
const MAX_DAYS_AFTER_PUBLICATION = 365;

/** A day's slack before "earlier than the publication date" counts, so a feed whose publication timestamp lands on the next UTC day never trips it. */
const PUBLICATION_SLACK_DAYS = 1;

export type KeyDateProblem = {
  code: "out-of-order" | "before-publication" | "far-after-publication";
  /**
   * Whether the bid deadline itself is one of the dates in question.
   *
   * This field, not the code, is what decides consequences. An award read
   * after the contract signing is worth telling an admin and changes
   * nothing else; a submission date that cannot be right must not be
   * allowed to become the tender's 交标截止日, because a wrong deadline is
   * worse than no deadline — no deadline leaves the timeline rows visible
   * for the customer to judge, while a wrong one either closes a live
   * tender on the site or holds an expired one open.
   */
  touchesSubmission: boolean;
  /** Chinese, written for the admin who has the document in front of them. */
  message: string;
};

type Input = { type: TenderKeyDate["type"]; date: string };
type Row = { type: ExtractedType; date: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const zh = (type: ExtractedType) => KEY_DATE_TYPE_LABELS[type].zh;

/** Day count between two "YYYY-MM-DD" days. Both parse at UTC midnight, so this is exact. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

/**
 * "2026-10-09" -> "2026-09-10", when that is a real day.
 *
 * Null when the day of month is past 12 (there is nothing it could have
 * been swapped with) or the swap lands on a day that does not exist, so
 * this only ever proposes a reading the document could actually carry.
 */
export function swapDayAndMonth(day: string): string | null {
  if (!ISO_DAY.test(day)) return null;
  const [year, month, dayOfMonth] = day.split("-");
  if (Number(dayOfMonth) < 1 || Number(dayOfMonth) > 12) return null;
  const swapped = `${year}-${dayOfMonth}-${month}`;
  return new Date(`${swapped}T00:00:00.000Z`).toISOString().slice(0, 10) === swapped ? swapped : null;
}

/** How the document itself would have printed a day: DD/MM. */
const asWritten = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * The sentence that makes an ordering complaint actionable: when swapping
 * one of the two dates' day and month puts the pair back in order, say so
 * and name the reading. That is the difference between "these two dates
 * disagree" — which leaves the admin to re-read the whole document — and
 * "the 10/09 on page 7 was read as month/day", which they can confirm in
 * one glance.
 */
function swapHint(earlier: Row, later: Row): string {
  for (const candidate of [earlier, later]) {
    const fixed = swapDayAndMonth(candidate.date);
    if (!fixed) continue;
    const ordered = candidate === earlier ? fixed <= later.date : earlier.date <= fixed;
    if (!ordered) continue;
    return `把${zh(candidate.type)}的 ${candidate.date} 改成 ${fixed} 就顺了——标书里的 ${asWritten(fixed)} 是「日/月」，很可能被当成「月/日」读了。`;
  }
  return "请对照标书原文核对。";
}

/** The rows of one rank, earliest and latest, in rank order. Rows the checker has no opinion on (publication, validity_end) and anything not an ISO day are dropped first. */
function rankGroups(keyDates: readonly Input[]): Row[][] {
  const rows = keyDates.filter((item): item is Row => item.type in RANK && ISO_DAY.test(item.date));
  const byRank = new Map<number, Row[]>();
  for (const row of rows) {
    const group = byRank.get(RANK[row.type]);
    if (group) group.push(row);
    else byRank.set(RANK[row.type], [row]);
  }
  return [...byRank.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

const earliest = (group: Row[]) => group.reduce((a, b) => (b.date < a.date ? b : a));
const latest = (group: Row[]) => group.reduce((a, b) => (b.date > a.date ? b : a));

/**
 * One problem per offending row rather than one per violating pair.
 *
 * A deadline misread a month late conflicts with the opening AND the award
 * AND the signing — three complaints about one mistake, which reads as
 * three mistakes. So this walks the ranks once carrying the latest date
 * seen, reports the first row that goes backwards, and then continues FROM
 * that row: the outlier is named once and the rest of the schedule is
 * judged on its own terms.
 */
function findOrderProblems(groups: Row[][]): KeyDateProblem[] {
  const problems: KeyDateProblem[] = [];
  let previous: Row | null = null;

  for (const group of groups) {
    const first = earliest(group);
    if (previous && first.date < previous.date) {
      problems.push({
        code: "out-of-order",
        touchesSubmission: previous.type === "submission" || first.type === "submission",
        message: `日程顺序不对：${zh(previous.type)}（${previous.date}）排在${zh(first.type)}（${first.date}）之后。${swapHint(previous, first)}`,
      });
    }
    previous = latest(group);
  }

  return problems;
}

/**
 * One problem per code rather than one per row, for the same reason: a
 * misread year usually hits every row of the schedule at once, and eight
 * copies of the same sentence is not eight findings. The submission row is
 * chosen as the example when it qualifies, because it is the one whose
 * consequence differs.
 */
function summarise(
  rows: Row[],
  code: KeyDateProblem["code"],
  message: (row: Row, others: number) => string,
): KeyDateProblem[] {
  if (rows.length === 0) return [];
  const example = rows.find((row) => row.type === "submission") ?? rows[0];
  return [{
    code,
    touchesSubmission: rows.some((row) => row.type === "submission"),
    message: message(example, rows.length - 1),
  }];
}

export function findKeyDateProblems(
  keyDates: readonly Input[],
  context: { publicationDate?: string | null } = {},
): KeyDateProblem[] {
  const groups = rankGroups(keyDates);
  const problems = findOrderProblems(groups);

  const publicationDay = context.publicationDate?.slice(0, 10);
  if (!publicationDay || !ISO_DAY.test(publicationDay)) return problems;

  const rows = groups.flat();
  const tooEarly = rows.filter((row) => daysBetween(publicationDay, row.date) < -PUBLICATION_SLACK_DAYS);
  // Sorted so the example named is the most extreme one, which is the row
  // whose year is most obviously wrong.
  const tooLate = rows
    .filter((row) => daysBetween(publicationDay, row.date) > MAX_DAYS_AFTER_PUBLICATION)
    .sort((a, b) => b.date.localeCompare(a.date));

  problems.push(
    ...summarise(
      [...tooEarly].sort((a, b) => a.date.localeCompare(b.date)),
      "before-publication",
      (row, others) =>
        `${zh(row.type)}（${row.date}）早于项目发布日（${publicationDay}）${others > 0 ? `，另有 ${others} 行也是` : ""}——这份日程可能属于另一次更早的采购程序，或者年份读错了。`,
    ),
    ...summarise(
      tooLate,
      "far-after-publication",
      (row, others) =>
        `${zh(row.type)}（${row.date}）比项目发布日（${publicationDay}）晚了 ${daysBetween(publicationDay, row.date)} 天${others > 0 ? `，另有 ${others} 行也超过一年` : ""}——通常是年份读错，或者抓到了合同工期里的日期。`,
    ),
  );

  return problems;
}

/** True when at least one problem implicates the bid deadline — i.e. the extracted submission date is not trustworthy enough to fill `submission_deadline`. */
export function submissionIsSuspect(problems: readonly KeyDateProblem[]): boolean {
  return problems.some((problem) => problem.touchesSubmission);
}
