/**
 * When 招标概览 shows the 不发标 notice, in Beijing time.
 *
 * User, 2026-10-11: 每到周末，因为政府不发标能不能加个提醒，避免中国人因为时差，
 * 以为是我们网站不更新、或者更新慢. Holidays too, but only the ones shared
 * across Latin America (user: 通用节假日可以，个别的算了，像是1/1):
 * 1 January, Good Friday, 1 May and 25 December.
 *
 * The imports run at about 19:00 and 05:00 Beijing time (vercel.json). A Latin
 * American day's postings mostly arrive with the 05:00 run the next Beijing
 * morning, and 24小时新增 is a rolling 24 hours. So a day with no postings, D,
 * shows as a low count until D+2 05:00 Beijing. The notice covers D 00:00 to
 * D+2 06:00 Beijing. For a weekend that is Saturday 00:00 to Tuesday 06:00.
 * Windows that touch or overlap are merged, and the notice names the weekday
 * the merged stretch ends. China has no daylight saving, so fixed Beijing
 * hours stay correct all year.
 */
const DAY_MS = 24 * 3600_000;
const BEIJING_OFFSET_MS = 8 * 3600_000;
const RESUME_HOUR = 6;
const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export type PublishingLull = {
  /** True when the stretch includes a holiday, not just a weekend. */
  holiday: boolean;
  /** Beijing weekday the count is back to normal, e.g. 周二. */
  resumeWeekday: string;
};

/** Easter Sunday (anonymous Gregorian algorithm), as a UTC day number. */
function easterDay(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** day = whole days since 1970-01-01, read as a calendar date. */
function isSharedHoliday(day: number): boolean {
  const date = new Date(day * DAY_MS);
  const month = date.getUTCMonth() + 1;
  const dom = date.getUTCDate();
  if ((month === 1 && dom === 1) || (month === 5 && dom === 1) || (month === 12 && dom === 25)) return true;
  return day === easterDay(date.getUTCFullYear()) - 2;
}

function isQuietDay(day: number): boolean {
  const weekday = new Date(day * DAY_MS).getUTCDay();
  return weekday === 0 || weekday === 6 || isSharedHoliday(day);
}

export function publishingLull(now: Date): PublishingLull | null {
  const beijing = now.getTime() + BEIJING_OFFSET_MS;
  const today = Math.floor(beijing / DAY_MS);
  const hour = (beijing - today * DAY_MS) / 3600_000;

  // A quiet day D covers Beijing [D 00:00, D+2 06:00).
  const covering = [today, today - 1, today - 2].filter((day) =>
    isQuietDay(day) && (day >= today - 1 || hour < RESUME_HOUR),
  );
  if (covering.length === 0) return null;

  // Walk forward through quiet days whose windows touch: D's window reaches
  // D+2 06:00, so the next quiet day may be one or two days later.
  let last = Math.max(...covering);
  let holiday = covering.some(isSharedHoliday);
  for (;;) {
    const next = [last + 1, last + 2].find(isQuietDay);
    if (next === undefined) break;
    last = next;
    holiday ||= isSharedHoliday(next);
  }
  return { holiday, resumeWeekday: WEEKDAY_ZH[new Date((last + 2) * DAY_MS).getUTCDay()] };
}
