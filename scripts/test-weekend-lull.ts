/** Offline checks for the 招标概览 不发标 notice window (Beijing time). */
import { publishingLull } from "../lib/weekend-lull";

let passed = 0;
let failed = 0;

function check(label: string, iso: string, expected: string | null) {
  const lull = publishingLull(new Date(iso));
  const actual = lull === null ? null : `${lull.holiday ? "节假日" : "周末"}→${lull.resumeWeekday}`;
  if (actual === expected) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}: expected ${expected}, got ${actual}`);
  }
}

// Beijing is UTC+8. 2026-10-10 is a Saturday.
check("Friday 23:59 Beijing: hidden", "2026-10-09T15:59:00Z", null);
check("Saturday 00:00 Beijing: shown", "2026-10-09T16:00:00Z", "周末→周二");
check("Sunday noon Beijing: shown", "2026-10-11T04:00:00Z", "周末→周二");
check("Monday 21:00 Beijing: shown", "2026-10-12T13:00:00Z", "周末→周二");
check("Tuesday 05:59 Beijing: shown", "2026-10-12T21:59:00Z", "周末→周二");
check("Tuesday 06:00 Beijing: hidden", "2026-10-12T22:00:00Z", null);
check("Wednesday noon Beijing: hidden", "2026-10-14T04:00:00Z", null);

// 2026-12-25 is a Friday: merges with the weekend.
check("Christmas Friday: shown to Tuesday", "2026-12-25T04:00:00Z", "节假日→周二");
check("Christmas Thursday 23:00: hidden", "2026-12-24T15:00:00Z", null);
// 2027-01-01 is a Friday too.
check("New Year Friday: shown", "2027-01-01T04:00:00Z", "节假日→周二");
// 2026-05-01 is a Friday. 2027-05-01 is a Saturday, already weekend.
check("1 May 2026: shown", "2026-05-01T04:00:00Z", "节假日→周二");
check("1 May 2027 (Saturday): holiday wording", "2027-05-01T04:00:00Z", "节假日→周二");
// Good Friday: 2026-04-03, 2027-03-26.
check("Good Friday 2026: shown", "2026-04-03T04:00:00Z", "节假日→周二");
check("Thursday before Good Friday 2027: hidden", "2027-03-25T04:00:00Z", null);
check("Good Friday 2027: shown", "2027-03-26T04:00:00Z", "节假日→周二");
// 2030-01-01 is a Tuesday: weekend, Monday at work, then the holiday.
check("Monday 2029-12-31 noon: weekend merges into the holiday, to Thursday", "2029-12-31T04:00:00Z", "节假日→周四");
check("New Year Tuesday 2030: shown to Thursday", "2030-01-01T04:00:00Z", "节假日→周四");
check("Thursday 2030-01-03 05:59: shown", "2030-01-02T21:59:00Z", "节假日→周四");
check("Thursday 2030-01-03 06:00: hidden", "2030-01-02T22:00:00Z", null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
