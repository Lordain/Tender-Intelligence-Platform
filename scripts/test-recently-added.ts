/**
 * 24小时新增 counts a ROLLING day, not the calendar day.
 *
 * The user watching that cell on 2026-09-15 described the old behaviour
 * exactly: 「因为墨西哥项目都在晚上发标，如果只看当天，很多数量可能只有晚上
 * 看得到，然后一下子又刷新了」. A calendar-day counter against sources that
 * publish in the evening sits at or near zero through the working day, fills
 * up at night, and is then thrown away at midnight — a few hours after it
 * first meant anything.
 *
 * The cases below are set at the hours where the two rules disagree: just
 * after midnight, when a calendar counter has reset but a rolling one still
 * carries last night's batch.
 *
 * It is measured from createdAt, the ingestion instant, rather than from
 * publication_date. Two Mexican mappers fabricate a publication date when the
 * source carries none, so publication date answers "when did the government
 * publish this" only sometimes, while createdAt always answers "when did this
 * appear on the site" — the question 新增 actually asks.
 *
 * Offline: buildTenderListPage is pure and takes `now`, so no Supabase, no
 * network, no clock dependency.
 */
import { buildTenderListPage } from "../lib/tender-list-page";
import type { Tender } from "../types/tender";

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

/** A live tender that entered the database at `createdAt`. */
function tender(slug: string, createdAt: string): Tender {
  return {
    slug,
    title: { zh: slug, es: slug },
    summary: { zh: "", es: "" },
    industries: ["construction"],
    scopeType: "works",
    status: "open",
    country: "Mexico",
    publicationDate: "2026-09-14",
    submissionDeadline: "2026-12-01",
    relevance: { tier: "standard", signals: [], reasons: [] },
    createdAt,
  } as unknown as Tender;
}

const count = (tenders: Tender[], now: string) =>
  buildTenderListPage(tenders, {}, { now: new Date(now) }).newTodayCount;

// 22:30 on the 14th in Mexico City (UTC-6) is 04:30 UTC on the 15th — the
// evening batch the Mexican sources actually publish.
const LAST_NIGHT = "2026-09-15T04:30:00.000Z";
const batch = [tender("mx-1", LAST_NIGHT), tender("mx-2", LAST_NIGHT), tender("mx-3", LAST_NIGHT)];

check(
  "the evening batch counts while it is still the evening",
  count(batch, "2026-09-15T05:00:00.000Z") === 3,
  `got ${count(batch, "2026-09-15T05:00:00.000Z")}`,
);

// THE REGRESSION. 09:00 UTC is 03:00 on the 15th in Mexico City: a new
// calendar day, so the old rule reported 0 — four and a half hours after the
// tenders arrived, and before anyone was awake to see the number they replaced.
check(
  "…and still counts after local midnight, which is the whole point",
  count(batch, "2026-09-15T09:00:00.000Z") === 3,
  `got ${count(batch, "2026-09-15T09:00:00.000Z")}`,
);

check(
  "…and through the next working day",
  count(batch, "2026-09-15T20:00:00.000Z") === 3,
  `got ${count(batch, "2026-09-15T20:00:00.000Z")}`,
);

check(
  "…and drops out once a full 24 hours has passed, not before",
  count(batch, "2026-09-16T04:29:00.000Z") === 3 && count(batch, "2026-09-16T04:31:00.000Z") === 0,
  `got ${count(batch, "2026-09-16T04:29:00.000Z")} then ${count(batch, "2026-09-16T04:31:00.000Z")}`,
);

check(
  "something ingested a week ago never counts",
  count([tender("old", "2026-09-08T04:30:00.000Z")], LAST_NIGHT) === 0,
);

// A clock skew between the ingesting machine and the rendering one would
// otherwise let a row sit in the count for 24 hours PLUS the skew.
check(
  "a createdAt in the future does not count",
  count([tender("future", "2026-09-16T00:00:00.000Z")], LAST_NIGHT) === 0,
);

check(
  "an unparseable createdAt is ignored rather than counted or thrown on",
  count([tender("broken", "not a date")], LAST_NIGHT) === 0,
);

// The 「本日新增」 cell is a button that filters the list to the same set, so
// the count and the view have to agree — a count of 3 opening a list of 0 is
// the bug this catches.
{
  const page = buildTenderListPage(batch, { view: "new" }, { now: new Date("2026-09-15T09:00:00.000Z") });
  check(
    "clicking the cell shows exactly the rows it counted",
    page.newTodayCount === 3 && page.totalResults === 3,
    `count ${page.newTodayCount}, list ${page.totalResults}`,
  );
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
