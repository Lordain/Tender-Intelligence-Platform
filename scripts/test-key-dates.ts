/**
 * Behaviour tests for the two pure pieces of the key-date pipeline:
 * toCalendarDay() (what a model is allowed to have read off a page) and
 * deriveTenderStatus()'s validity_end rule.
 *
 * Dates are the one extracted field that is ACTED on rather than read — they
 * drive 交标截止日, the 招标中/已截止 status and the digest — and the single
 * most dangerous input is the one that parses successfully into the wrong
 * day: every country this platform reads writes 10/09/2026 for 10 September,
 * while `new Date("10/09/2026")` answers October 9th without complaint.
 *
 * No network, no database.
 *
 * Usage: npm run test:key-dates
 */
import { toCalendarDay } from "../lib/ingestion/extract-requirements";
import { deriveTenderStatus, platformDay } from "../lib/tender-status";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-09-12T12:00:00.000Z");

// toCalendarDay: what gets through
check("a plain ISO day passes", toCalendarDay("2026-09-10", NOW) === "2026-09-10");
check("surrounding whitespace is tolerated", toCalendarDay("  2026-09-10  ", NOW) === "2026-09-10");

// toCalendarDay: what must NOT get through
check("a DD/MM/YYYY date is rejected, not guessed", toCalendarDay("10/09/2026", NOW) === null, String(toCalendarDay("10/09/2026", NOW)));
check("a Spanish long date is rejected", toCalendarDay("10 de septiembre de 2026", NOW) === null);
check("an ISO timestamp is rejected (day only)", toCalendarDay("2026-09-10T23:59:00-05:00", NOW) === null);
check("a day that does not exist is rejected", toCalendarDay("2026-02-30", NOW) === null);
check("a single-digit month is rejected", toCalendarDay("2026-9-10", NOW) === null);
check("an empty string is rejected", toCalendarDay("", NOW) === null);
check("a year far in the past is rejected", toCalendarDay("2014-09-10", NOW) === null);
check("a year far in the future is rejected", toCalendarDay("2099-09-10", NOW) === null);
check("next year is still accepted", toCalendarDay("2027-03-01", NOW) === "2027-03-01");

// deriveTenderStatus: the validity_end rule
const publication = { type: "publication" as const, date: "2026-01-01" };
check(
  "no dates at all still reads 招标中",
  deriveTenderStatus("open", { keyDates: [publication] }, NOW) === "open",
);
check(
  "a passed validity_end closes the tender",
  deriveTenderStatus("open", { keyDates: [publication, { type: "validity_end", date: "2026-09-11" }] }, NOW) === "submission_closed",
);
check(
  "a future validity_end leaves it open",
  deriveTenderStatus("open", { keyDates: [publication, { type: "validity_end", date: "2028-08-27" }] }, NOW) === "open",
);
check(
  "validity_end on today itself has not passed",
  deriveTenderStatus("open", { keyDates: [{ type: "validity_end", date: "2026-09-12" }] }, NOW) === "open",
);
check(
  "an awarded tender is not reopened or re-closed by validity_end",
  deriveTenderStatus("awarded", { keyDates: [{ type: "validity_end", date: "2026-09-11" }] }, NOW) === "awarded",
);
check(
  "a passed submission deadline still wins on its own",
  deriveTenderStatus("open", { submissionDeadline: "2026-09-01", keyDates: [] }, NOW) === "submission_closed",
);
check(
  "clarification day still beats plain open when nothing has expired",
  deriveTenderStatus("open", { keyDates: [{ type: "clarification", date: "2026-09-12" }] }, NOW) === "clarification",
);

// The off-by-one that made both of the above wrong for a year (see
// platformDay's own comment): every date this code receives from Supabase is
// a `date` column, returned as a bare "YYYY-MM-DD".
check("a bare date column value is not shifted by the timezone", platformDay("2026-09-12") === "2026-09-12", String(platformDay("2026-09-12")));
check("a real timestamp is still converted to its Mexico City day", platformDay("2026-09-13T03:00:00.000Z") === "2026-09-12", String(platformDay("2026-09-13T03:00:00.000Z")));
check(
  "a tender does NOT read 已截止 on the morning of its own deadline",
  deriveTenderStatus("open", { submissionDeadline: "2026-09-12", keyDates: [] }, NOW) === "open",
);
check(
  "it does the day after",
  deriveTenderStatus("open", { submissionDeadline: "2026-09-11", keyDates: [] }, NOW) === "submission_closed",
);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
