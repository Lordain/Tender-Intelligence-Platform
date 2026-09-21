import { latestStatedDay, type AntaqHearing } from "@/lib/ingestion/antaq-audiencia-parser";

/**
 * How old is an ANTAQ hearing — and which date on the page is allowed to say.
 *
 * ── The bug this replaces ─────────────────────────────────────────────────
 *
 * The ingest script used to window on `publishedAt`, the date in Plone's
 * byline, through the generic filterRecentTenders(). That filter is correct
 * everywhere else, because everywhere else `publicationDate` is when the
 * buyer published the notice. On gov.br it is when the PAGE was last given an
 * effective date, and ANTAQ re-stamps it. Measured on the captures of
 * 2026-09-19 and on the user's live run of 2026-09-20:
 *
 *   AP 07/2025 SSB01   comment period 29/12/2025 – 27/01/2026, page says
 *                      published 08/06/2026 — five months after it closed.
 *   AP 04/2026 VDC04   comment period opened 23/04/2026, page says published
 *                      25/05/2026 — a month AFTER it opened.
 *   AP 03/2024 ITJ     a 2024 hearing, page says published 06/07/2026, and
 *                      its URL is under `audiencias-encerradas`.
 *
 * So `--months 12` was not measuring twelve months of hearings. It was
 * measuring twelve months of Plone edits, and a hearing survived the window
 * by being touched, not by being recent. AP 03/2024 stayed in for that
 * reason — which turned out fine, since it carries a Data Room and TCU-revised
 * documents, but it stayed in by accident and the next one will not.
 *
 * ── What is allowed to say, in order ──────────────────────────────────────
 *
 * 1. The hearing's own number. `07/2026` carries its year, ANTAQ numbers per
 *    calendar year, and nothing re-stamps a number. This is the spine.
 * 2. The dates the hearing states about itself — the cronograma and the
 *    contributions deadline (see statedDays()). These can only RESCUE a
 *    hearing the year would drop: a 2024 consultation still running sessions
 *    in 2026 is live whatever its number says, and ANTAQ does keep old
 *    numbers alive for years while a project clears the TCU.
 * 3. Plone's byline decides nothing. It is read only to say so out loud when
 *    it disagrees with the two above, so an operator sees the re-stamp rather
 *    than inheriting it.
 *
 * ── Why years and not months ──────────────────────────────────────────────
 *
 * Because a hearing number carries a year and not a month, and a window in
 * months applied to a year-granular signal would have to invent eleven months
 * of precision it does not have. The unit of the flag is now the unit of the
 * data. Two years is the default: a port concession runs a consultation, a
 * TCU review and then an auction, and the whole point of reading the hearing
 * instead of the auction is to meet the project early enough to prepare — a
 * twelve-month window would throw away the ones about to be tendered.
 */

export type AntaqWindowVerdict = {
  inWindow: boolean;
  /** The year on the hearing's own number. */
  hearingYear: number;
  /** The last day the hearing states about itself, if it states any. */
  lastStatedDay?: string;
  /** True when the year would have dropped it and its own schedule kept it. */
  rescuedBySchedule: boolean;
  /** One line for the run report, always populated. */
  why: string;
  /** Set when Plone's byline disagrees with the hearing's own dates. */
  pageStampWarning?: string;
};

/**
 * `years` counts calendar years inclusive of the current one: 2 in 2026 keeps
 * 2025 and 2026. 0 or less means no window at all.
 */
export function judgeAntaqWindow(hearing: AntaqHearing, years: number, now: Date = new Date()): AntaqWindowVerdict {
  const lastStatedDay = latestStatedDay(hearing);
  const statedYear = lastStatedDay === undefined ? undefined : Number(lastStatedDay.slice(0, 4));

  // Plone's byline is read here and used nowhere else. It is "wrong" in the
  // only sense that matters: it claims a date for the hearing that the
  // hearing's own text contradicts.
  const stamp = hearing.publishedAt;
  const stampWarning =
    stamp === undefined
      ? undefined
      : Number(stamp.slice(0, 4)) !== hearing.year
        ? `页面发布日 ${stamp} 和场次号 ${hearing.number} 不是一个年份 —— Plone 重新盖过章，这个日期不算数`
        : lastStatedDay !== undefined && stamp > lastStatedDay
          ? `页面发布日 ${stamp} 比听证自己排的最后一天 ${lastStatedDay} 还晚 —— Plone 重新盖过章，这个日期不算数`
          : undefined;

  if (!Number.isFinite(years) || years <= 0) {
    return {
      inWindow: true,
      hearingYear: hearing.year,
      lastStatedDay,
      rescuedBySchedule: false,
      why: "未设窗口",
      pageStampWarning: stampWarning,
    };
  }

  const cutoffYear = now.getUTCFullYear() - (years - 1);

  if (hearing.year >= cutoffYear) {
    return {
      inWindow: true,
      hearingYear: hearing.year,
      lastStatedDay,
      rescuedBySchedule: false,
      why: `场次号是 ${hearing.year} 年的`,
      pageStampWarning: stampWarning,
    };
  }

  if (statedYear !== undefined && statedYear >= cutoffYear) {
    return {
      inWindow: true,
      hearingYear: hearing.year,
      lastStatedDay,
      rescuedBySchedule: true,
      why: `场次号是 ${hearing.year} 年的，但它自己的日程排到 ${lastStatedDay}，还在走`,
      pageStampWarning: stampWarning,
    };
  }

  return {
    inWindow: false,
    hearingYear: hearing.year,
    lastStatedDay,
    rescuedBySchedule: false,
    why:
      lastStatedDay === undefined
        ? `场次号 ${hearing.year} 年，页面没排日程，${cutoffYear} 年以前的不看`
        : `场次号 ${hearing.year} 年，日程最晚 ${lastStatedDay}，都在 ${cutoffYear} 年以前`,
    pageStampWarning: stampWarning,
  };
}
