/**
 * When 招标概览 shows the weekend notice, in Beijing time.
 *
 * User, 2026-10-11: 每到周末，因为政府不发标能不能加个提醒，避免中国人因为时差，
 * 以为是我们网站不更新、或者更新慢. Latin American governments publish on
 * working days. The imports run at about 19:00 and 05:00 Beijing time
 * (vercel.json), and 24小时新增 is a rolling 24 hours. So from Sunday morning
 * Beijing time the window holds only weekend runs. Monday's postings, made in
 * the Latin American daytime, come in with the Tuesday 05:00 run.
 *
 * Window: Saturday 00:00 to Tuesday 06:00 Beijing. Saturday is included because
 * the user asked for 周末. China has no daylight saving, so fixed Beijing
 * hours stay correct all year.
 */
const BEIJING_WEEKDAY_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

export function isWeekendLull(now: Date): boolean {
  const parts = BEIJING_WEEKDAY_HOUR.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  if (weekday === "Sat" || weekday === "Sun" || weekday === "Mon") return true;
  return weekday === "Tue" && hour < 6;
}
