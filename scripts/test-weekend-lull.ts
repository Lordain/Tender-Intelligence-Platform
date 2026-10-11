/** Offline checks for the 招标概览 weekend notice window (Beijing time). */
import { isWeekendLull } from "../lib/weekend-lull";

let passed = 0;
let failed = 0;

function check(label: string, iso: string, expected: boolean) {
  const actual = isWeekendLull(new Date(iso));
  if (actual === expected) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}: expected ${expected}, got ${actual}`);
  }
}

// 2026-10-10 is a Saturday. Beijing is UTC+8.
check("Friday 23:59 Beijing: hidden", "2026-10-09T15:59:00Z", false);
check("Saturday 00:00 Beijing: shown", "2026-10-09T16:00:00Z", true);
check("Sunday noon Beijing: shown", "2026-10-11T04:00:00Z", true);
check("Monday 21:00 Beijing: shown", "2026-10-12T13:00:00Z", true);
check("Tuesday 05:59 Beijing: shown", "2026-10-12T21:59:00Z", true);
check("Tuesday 06:00 Beijing: hidden", "2026-10-12T22:00:00Z", false);
check("Wednesday noon Beijing: hidden", "2026-10-14T04:00:00Z", false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
