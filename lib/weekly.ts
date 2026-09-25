/**
 * ISO weeks for the weekly digest (/weekly/2026-w39): Monday to Sunday, week
 * 1 being the one holding the year's first Thursday — the numbering Chinese
 * readers see as 第39周 on a work calendar.
 *
 * Pure date arithmetic on UTC calendar days, no timezone: a tender's
 * publicationDate is compared as its "YYYY-MM-DD" prefix, so a week is just
 * a range of day strings. No `server-only` — scripts/ping-indexnow.ts needs
 * the current week's path too.
 */
export type IsoWeek = { year: number; week: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isoWeekOf(date: Date): IsoWeek {
  const day = utcDay(date);
  const weekday = day.getUTCDay() || 7; // Monday 1 … Sunday 7
  const thursday = new Date(day.getTime() + (4 - weekday) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return { year, week };
}

/** Monday of the week, 00:00 UTC. */
export function weekStart({ year, week }: IsoWeek): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayOfWeek1 = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS;
  return new Date(mondayOfWeek1 + (week - 1) * 7 * DAY_MS);
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The week's first and last day as "YYYY-MM-DD", inclusive. */
export function weekDays(week: IsoWeek): { from: string; to: string } {
  const start = weekStart(week);
  return { from: dayString(start), to: dayString(new Date(start.getTime() + 6 * DAY_MS)) };
}

export function weekSlug({ year, week }: IsoWeek): string {
  return `${year}-w${String(week).padStart(2, "0")}`;
}

/** undefined for anything that is not a real ISO week — 2026-w54, 2026-w00, "latest". */
export function parseWeekSlug(slug: string): IsoWeek | undefined {
  const match = /^(\d{4})-w(\d{2})$/.exec(slug);
  if (!match) return undefined;
  const week = { year: Number(match[1]), week: Number(match[2]) };
  if (week.week < 1) return undefined;
  // Round-trip: a week past the year's last one lands in the next year.
  const back = isoWeekOf(weekStart(week));
  return back.year === week.year && back.week === week.week ? week : undefined;
}

export function shiftWeek(week: IsoWeek, by: number): IsoWeek {
  return isoWeekOf(new Date(weekStart(week).getTime() + by * 7 * DAY_MS));
}

export function compareWeeks(a: IsoWeek, b: IsoWeek): number {
  return a.year - b.year || a.week - b.week;
}

/** "9月21日—27日", or "12月29日—1月4日" across a month. */
export function formatWeekRange(week: IsoWeek): string {
  const { from, to } = weekDays(week);
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  return fm === tm ? `${fm}月${fd}日—${td}日` : `${fm}月${fd}日—${tm}月${td}日`;
}

export function weekTitle(week: IsoWeek): string {
  return `${week.year}年第${week.week}周`;
}
