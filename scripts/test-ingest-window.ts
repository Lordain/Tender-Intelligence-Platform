/**
 * The import window: how far back a run reaches, and what it keeps.
 *
 * Worth pinning because the failure is silent. A `--days 5` run that
 * actually fetches two months prints "Fetched 12,000 rows, kept 340" and
 * looks exactly like a `--days 5` run that worked — nothing in the output
 * says which window was used, and by the time anyone notices, the rows are
 * already written.
 *
 * Usage: npm run test:ingest-window
 */
import { resolveIngestWindow } from "../lib/ingestion/ingest-colombia";
import { filterRecentTenders, filterTendersPublishedWithinDays } from "../lib/ingestion/recency";
import type { Tender } from "../types/tender";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

type Check = { label: string; pass: boolean; detail?: string };
const checks: Check[] = [];
const check = (label: string, pass: boolean, detail?: string) => checks.push({ label, pass, detail });

// --- resolveIngestWindow -----------------------------------------------
const fiveDays = resolveIngestWindow({ months: 1, days: 5 }, NOW);
check("--days 5 时 useDays 为真", fiveDays.useDays);
check("--days 5 回溯正好 5 天", daysBetween(fiveDays.sinceDate, NOW) === 5, `实际 ${daysBetween(fiveDays.sinceDate, NOW)} 天`);

// The one that matters: days must not be silently widened by a months that
// was also passed. Both flags together is the realistic invocation, because
// --months has a default of 1 and is therefore ALWAYS present.
check(
  "同时给 --days 5 和 --months 1 时，按 5 天算而不是 1 个月",
  daysBetween(resolveIngestWindow({ months: 1, days: 5 }, NOW).sinceDate, NOW) === 5,
);
check(
  "同时给 --days 5 和 --months 6 时，仍然按 5 天算",
  daysBetween(resolveIngestWindow({ months: 6, days: 5 }, NOW).sinceDate, NOW) === 5,
);

const oneMonth = resolveIngestWindow({ months: 1 }, NOW);
check("不给 --days 时 useDays 为假", !oneMonth.useDays);
check("--months 1 回溯到上个月同一天", oneMonth.sinceDate.toISOString().slice(0, 10) === "2026-08-15", oneMonth.sinceDate.toISOString());

check("--days 0 视为未设置", !resolveIngestWindow({ months: 2, days: 0 }, NOW).useDays);
check("--days 负数视为未设置", !resolveIngestWindow({ months: 2, days: -3 }, NOW).useDays);
check(
  "months <= 0 且没有 days 时回退到 6 个月（而不是 0 天）",
  resolveIngestWindow({ months: 0 }, NOW).sinceDate.toISOString().slice(0, 10) === "2026-03-15",
  resolveIngestWindow({ months: 0 }, NOW).sinceDate.toISOString(),
);

// setMonth() clamps day-of-month, which is exactly why a day count must not
// be expressed as a fraction of a month. Pinned so nobody "simplifies" it
// back into one.
const march31 = resolveIngestWindow({ months: 1 }, new Date("2026-03-31T12:00:00.000Z"));
check(
  "月份回溯会夹日（3月31日减1个月落在3月初，不是2月28日）—— 这就是天数不能写成月份分数的原因",
  march31.sinceDate.getUTCMonth() === 2,
  march31.sinceDate.toISOString(),
);

// --- the recency filter the window then selects ------------------------
function tender(publishedDaysAgo: number): Tender {
  return {
    publicationDate: new Date(NOW.getTime() - publishedDaysAgo * DAY_MS).toISOString(),
    slug: `t-${publishedDaysAgo}`,
  } as Tender;
}
const corpus = [tender(1), tender(4), tender(6), tender(20), tender(50)];

const keptByDays = filterTendersPublishedWithinDays(corpus, 5, NOW);
check("5 天窗口只留下 5 天内发布的", keptByDays.length === 2, `留下 ${keptByDays.map((t) => t.slug).join(", ")}`);
check("5 天窗口把第 6 天的排除掉", !keptByDays.some((t) => t.slug === "t-6"));

const keptByMonths = filterRecentTenders(corpus, 1, NOW);
check("1 个月窗口留下 4 条（这就是 5 天和 1 个月的真实差别）", keptByMonths.length === 4, `留下 ${keptByMonths.length} 条`);

console.log("导入窗口\n");
let failures = 0;
for (const c of checks) {
  if (c.pass) console.log(`  OK    ${c.label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${c.label}${c.detail ? `\n        ${c.detail}` : ""}`);
  }
}
console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
if (failures > 0) process.exit(1);
