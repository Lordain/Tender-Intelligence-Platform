/**
 * deriveTenderStatus() had no test at all until 2026-09-18, which is how
 * rule 6 came to be reported twice from production rather than caught here:
 * first as a DOF "Fallo" row read as an outcome (2026-09-08), then as a CFE
 * row shown 已中标 with 交标 six weeks away (2026-09-18, 都还没交标怎么就已中标了？).
 *
 * Every case below is a rule from lib/tender-status.ts's header, exercised
 * against a FIXED `now` so the suite does not start failing on a calendar
 * boundary. 2026-09-18 is the day rule 6 was written; the dates around it
 * are the real ones from that report.
 *
 *   npm run test:tender-status
 */
import { deriveTenderStatus, STALE_WITHOUT_END_DATE_DAYS } from "../lib/tender-status";
import type { TenderKeyDate, TenderStatus } from "../types/tender";

/** Mid-morning in Mexico City on 2026-09-18 — platformDay() resolves this to "2026-09-18". */
const NOW = new Date("2026-09-18T16:00:00.000Z");

type Case = {
  name: string;
  stored: TenderStatus;
  submissionDeadline?: string | null;
  publicationDate?: string | null;
  keyDates?: Pick<TenderKeyDate, "type" | "date">[];
  expected: TenderStatus;
};

const CASES: Case[] = [
  // --- Rule 6: an award cannot precede the deadline ------------------------
  {
    // The report. CFE, published 15/09, 交标 26/10, stored "awarded".
    name: "awarded + deadline still weeks away -> open (the 2026-09-18 report)",
    stored: "awarded",
    publicationDate: "2026-09-15T00:00:00.000Z",
    submissionDeadline: "2026-10-26T00:00:00.000Z",
    expected: "open",
  },
  {
    // The boundary the day-string comparison exists for: bidding closes at
    // some hour TODAY, so a reader this morning can still submit.
    name: "awarded + deadline is today -> open, not awarded",
    stored: "awarded",
    submissionDeadline: "2026-09-18T20:00:00.000Z",
    expected: "open",
  },
  {
    name: "awarded + deadline passed yesterday -> awarded",
    stored: "awarded",
    submissionDeadline: "2026-09-17T00:00:00.000Z",
    expected: "awarded",
  },
  {
    // The ordinary case, and by far the commonest: contracts exports carry no
    // deadline at all, so there is nothing to contradict.
    name: "awarded + no deadline of any kind -> awarded",
    stored: "awarded",
    publicationDate: "2026-03-01T00:00:00.000Z",
    expected: "awarded",
  },
  {
    // Rule 6 is about "awarded" only. A procurement really can be called off
    // while bidding is open, so this must NOT be softened the same way.
    name: "cancelled + deadline still in the future -> cancelled",
    stored: "cancelled",
    submissionDeadline: "2026-10-26T00:00:00.000Z",
    expected: "cancelled",
  },
  {
    // Rule 6 must not resurrect a tender either: the clarification day still
    // wins over a bare "open" once the contradiction is resolved.
    name: "awarded + future deadline + clarification today -> clarification",
    stored: "awarded",
    submissionDeadline: "2026-10-26T00:00:00.000Z",
    keyDates: [{ type: "clarification", date: "2026-09-18T15:00:00.000Z" }],
    expected: "clarification",
  },

  // --- Rules 1-5, so rule 6 cannot quietly break them ----------------------
  { name: "rule 1: planned reads as open", stored: "planned", submissionDeadline: "2026-10-26T00:00:00.000Z", expected: "open" },
  {
    name: "rule 2: clarification only on the day itself",
    stored: "open",
    submissionDeadline: "2026-10-26T00:00:00.000Z",
    keyDates: [{ type: "clarification", date: "2026-09-11T15:00:00.000Z" }],
    expected: "open",
  },
  { name: "rule 3: deadline passed -> submission_closed", stored: "open", submissionDeadline: "2026-09-17T00:00:00.000Z", expected: "submission_closed" },
  {
    name: "rule 4: passed validity_end closes a tender with no deadline (PEMEX)",
    stored: "open",
    publicationDate: "2026-09-01T00:00:00.000Z",
    keyDates: [{ type: "validity_end", date: "2026-09-16T00:00:00.000Z" }],
    expected: "submission_closed",
  },
  {
    name: "rule 4: a validity_end still ahead leaves it open",
    stored: "open",
    publicationDate: "2026-09-01T00:00:00.000Z",
    keyDates: [{ type: "validity_end", date: "2026-10-16T00:00:00.000Z" }],
    expected: "open",
  },
  {
    name: `rule 5: no end date, published more than ${STALE_WITHOUT_END_DATE_DAYS} days ago -> submission_closed (Peru OECE)`,
    stored: "open",
    publicationDate: "2026-07-01T00:00:00.000Z",
    expected: "submission_closed",
  },
  {
    name: "rule 5: no end date but published recently -> open",
    stored: "open",
    publicationDate: "2026-09-10T00:00:00.000Z",
    expected: "open",
  },
  {
    // Rule 5 sits BELOW the clarification check on purpose: a junta happening
    // today is direct evidence the procedure is live.
    name: "rule 5: a clarification today beats the staleness guess",
    stored: "open",
    publicationDate: "2026-07-01T00:00:00.000Z",
    keyDates: [{ type: "clarification", date: "2026-09-18T15:00:00.000Z" }],
    expected: "clarification",
  },

  // --- Migration 0057: 暂停中 and 流标 --------------------------------------
  {
    // A paused tender whose old deadline has passed is still paused, not
    // closed: the deadline usually moves when it resumes.
    name: "suspended + deadline passed -> suspended, not submission_closed",
    stored: "suspended",
    publicationDate: "2026-09-01T00:00:00.000Z",
    submissionDeadline: "2026-09-10T00:00:00.000Z",
    expected: "suspended",
  },
  {
    name: "suspended + deadline ahead -> suspended, not open",
    stored: "suspended",
    publicationDate: "2026-09-01T00:00:00.000Z",
    submissionDeadline: "2026-10-10T00:00:00.000Z",
    expected: "suspended",
  },
  {
    name: "suspended with no end date past 45 days -> still suspended (rule 5 does not close it)",
    stored: "suspended",
    publicationDate: "2026-06-01T00:00:00.000Z",
    expected: "suspended",
  },
  {
    // 流标 is a fact about the round, like cancelled — the calendar cannot undo it.
    name: "deserted + deadline ahead -> deserted",
    stored: "deserted",
    publicationDate: "2026-09-01T00:00:00.000Z",
    submissionDeadline: "2026-10-10T00:00:00.000Z",
    expected: "deserted",
  },
  {
    name: "resumed (stored open again) + new deadline ahead -> open",
    stored: "open",
    publicationDate: "2026-09-01T00:00:00.000Z",
    submissionDeadline: "2026-10-20T00:00:00.000Z",
    expected: "open",
  },
];

let failed = 0;
for (const testCase of CASES) {
  const actual = deriveTenderStatus(
    testCase.stored,
    {
      submissionDeadline: testCase.submissionDeadline,
      publicationDate: testCase.publicationDate,
      keyDates: testCase.keyDates,
    },
    NOW,
  );
  if (actual === testCase.expected) {
    console.log(`  ok    ${testCase.name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${testCase.name}\n          expected ${testCase.expected}, got ${actual}`);
  }
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
if (failed > 0) process.exit(1);
