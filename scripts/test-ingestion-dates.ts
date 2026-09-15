/**
 * An estimated publication date is the day it is IN MEXICO CITY, not in UTC.
 *
 * The bug, found by the user on 2026-09-14: a Compras MX import run that
 * evening filed every row under 发布 2026年9月15日. Mexico City is UTC-6, so
 * 18:00 there is already midnight UTC — and `publication_date` is a `date`
 * column, so handing it `new Date().toISOString()` made Postgres keep the UTC
 * day. Every import after 18:00 local was stamped tomorrow.
 *
 * Only the two mappers that FABRICATE a publication date were affected, and
 * both are Mexican, which is why every row in the user's screenshot carried
 * the 估 badge — the badge that says this date is ours, not the government's.
 * The other eleven mappers use `now` for createdAt/updatedAt only, where a
 * UTC instant is correct and must stay.
 *
 * Worth a test rather than just a fix, because it is invisible: the page
 * renders, the date looks like a date, and the only symptoms are a tender
 * dated in the future and age-based rules (filterRecentTenders,
 * purge:old-tenders) reasoning about a day that never happened.
 *
 * Offline: no network, no Supabase, no model calls.
 */
import { readFileSync } from "node:fs";
import { platformDay } from "../lib/tender-status";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`OK   ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

// ── The rule itself ────────────────────────────────────────────────────────
// 2026-09-15T01:39Z is 2026-09-14 19:39 in Mexico City — the user's actual
// import moment, to the hour.
check(
  "an evening Mexico City import is filed under that evening's day",
  platformDay("2026-09-15T01:39:00.000Z") === "2026-09-14",
  `got ${platformDay("2026-09-15T01:39:00.000Z")}`,
);
check(
  "…and 06:00 UTC, still the previous evening there, likewise",
  platformDay("2026-09-15T05:59:00.000Z") === "2026-09-14",
  `got ${platformDay("2026-09-15T05:59:00.000Z")}`,
);
check(
  "…while 06:00 UTC exactly has become the new day in Mexico City",
  platformDay("2026-09-15T06:00:00.000Z") === "2026-09-15",
  `got ${platformDay("2026-09-15T06:00:00.000Z")}`,
);
check(
  "a morning import is unaffected",
  platformDay("2026-09-15T16:00:00.000Z") === "2026-09-15",
  `got ${platformDay("2026-09-15T16:00:00.000Z")}`,
);

// ── The two mappers that fabricate one ─────────────────────────────────────
// Read as source: calling the mappers needs their whole row shape, and what
// matters is that neither hands a raw UTC timestamp to a `date` column.
for (const file of [
  "lib/ingestion/compras-mx-open-tenders-mapper.ts",
  "lib/ingestion/licitia-vigente-mapper.ts",
]) {
  const source = readFileSync(file, "utf-8");
  check(`${file} imports platformDay`, source.includes("import { platformDay }"), file);
  check(
    `${file} does not put a raw UTC \`now\` in publicationDate`,
    !/publicationDate(\s*[:=]\s*|\s*=\s*row\.\w+\s*\?\?\s*)now\s*[,;]/.test(source),
    "publicationDate must go through platformDay()",
  );
}

// ── And the ones that must NOT change ──────────────────────────────────────
// createdAt/updatedAt are timestamptz. An instant is right for them, and
// truncating those to a calendar day would lose the ordering the upsert
// protection relies on.
{
  const source = readFileSync("lib/ingestion/compras-mx-open-tenders-mapper.ts", "utf-8");
  check("createdAt keeps the full UTC instant", /createdAt:\s*now\s*,/.test(source));
  check("updatedAt keeps the full UTC instant", /updatedAt:\s*now\s*,/.test(source));
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
