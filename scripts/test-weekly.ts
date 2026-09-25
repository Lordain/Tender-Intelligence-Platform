/**
 * The weekly digest (/weekly/2026-w39) and the industry pages' lists.
 *
 * Offline and pure. Week arithmetic is the part that goes wrong silently —
 * a week that starts on Sunday, or a year boundary where 2026-12-31 belongs
 * to 2027's week 1 — and a wrong week is a digest listing the wrong tenders
 * under a correct-looking heading.
 */
import { compareWeeks, formatWeekRange, isoWeekOf, parseWeekSlug, shiftWeek, weekDays, weekSlug } from "../lib/weekly";
import { weeklyDigest, digestSummary } from "../lib/weekly-digest";
import { liveTenderCountsForIndustry, liveTenderLinksForIndustry, publishedTenderLinks } from "../lib/tender-links";
import type { Tender, TenderRelevanceTier, TenderStatus } from "../types/tender";

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { passed += 1; console.log(`OK   ${label}`); }
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

// Week arithmetic.
const w39 = isoWeekOf(new Date("2026-09-25T12:00:00Z"));
check("2026-09-25 (a Friday) is 2026 week 39", w39.year === 2026 && w39.week === 39, JSON.stringify(w39));
check("the week runs Monday 09-21 to Sunday 09-27", JSON.stringify(weekDays(w39)) === JSON.stringify({ from: "2026-09-21", to: "2026-09-27" }), JSON.stringify(weekDays(w39)));
check("Sunday belongs to the week that started the Monday before", compareWeeks(isoWeekOf(new Date("2026-09-27T23:00:00Z")), w39) === 0);
check("Monday starts the next week", isoWeekOf(new Date("2026-09-28T00:00:00Z")).week === 40);
const newYear = isoWeekOf(new Date("2026-12-31T12:00:00Z"));
check("2026-12-31 is week 53 of 2026 (the year has 53 weeks)", newYear.year === 2026 && newYear.week === 53, JSON.stringify(newYear));
check("2027-01-04 is week 1 of 2027", JSON.stringify(isoWeekOf(new Date("2027-01-04T12:00:00Z"))) === JSON.stringify({ year: 2027, week: 1 }));
check("shifting back across the year boundary", weekSlug(shiftWeek({ year: 2027, week: 1 }, -1)) === "2026-w53");
check("slug round-trip", weekSlug(w39) === "2026-w39" && compareWeeks(parseWeekSlug("2026-w39")!, w39) === 0);
check("week 54 is not a week", parseWeekSlug("2026-w54") === undefined);
check("week 53 of a 52-week year is not a week", parseWeekSlug("2025-w53") === undefined);
check("week 0 and junk are not weeks", parseWeekSlug("2026-w00") === undefined && parseWeekSlug("latest") === undefined && parseWeekSlug("2026-39") === undefined);
check("range label within a month", formatWeekRange(w39) === "9月21日—27日", formatWeekRange(w39));
check("range label across months", formatWeekRange({ year: 2026, week: 53 }) === "12月28日—1月3日", formatWeekRange({ year: 2026, week: 53 }));

// Selection.
function tender(id: string, o: { country?: string; industries?: string[]; tier?: TenderRelevanceTier; status?: TenderStatus; published?: string; deadline?: string; zh?: string } = {}): Tender {
  return {
    id, slug: id, publicSlug: `p-${id}`,
    country: o.country ?? "Mexico",
    industries: o.industries ?? ["power"],
    status: o.status ?? "open",
    scopeType: "works",
    publicationDate: o.published ?? "2026-09-23",
    submissionDeadline: o.deadline ?? "2026-10-18T17:00:00Z",
    title: { zh: o.zh ?? `中文标题 ${id}`, es: `Título ${id}`, en: "" },
    publicTitle: o.zh ?? `中文标题 ${id}`,
    buyer: "Comisión Federal de Electricidad",
    sourceName: "Compras MX",
    relevance: { tier: o.tier ?? "standard", label: "", reason: "" },
    createdAt: "2026-09-20T00:00:00Z",
  } as unknown as Tender;
}
const pool = [
  tender("mon", { published: "2026-09-21" }),
  tender("sun", { published: "2026-09-27T20:00:00Z", country: "Peru", industries: ["water"] }),
  tender("before", { published: "2026-09-20" }),
  tender("after", { published: "2026-09-28" }),
  tender("big", { tier: "flagship", country: "Brazil", industries: ["water", "construction"] }),
  tender("excluded", { tier: "excluded" }),
  tender("placeholder", { zh: "政府采购项目" }),
  tender("cancelled", { status: "cancelled", country: "Chile" }),
];
const week = publishedTenderLinks(pool, weekDays(w39)).map((link) => link.id);
check("Monday and Sunday are in, the days either side are out", week.includes("mon") && week.includes("sun") && !week.includes("before") && !week.includes("after"), week.join(","));
check("the excluded tier and placeholder titles stay out", !week.includes("excluded") && !week.includes("placeholder"));
check("a tender cancelled since still counts — the digest reports what came out", week.includes("cancelled"));
check("the biggest tier leads", week[0] === "big", week.join(","));

const digest = weeklyDigest(pool, w39, new Date("2026-09-25T12:00:00Z"));
check("the current week is flagged as current", digest.isCurrent);
check("highlights are flagship/significant only", digest.highlights.map((l) => l.id).join(",") === "big");
check("countries grouped, most first", digest.byCountry[0].country === "Mexico" && digest.byCountry.every((g) => g.links.length > 0));
check("综合 never counts as a top industry", !digest.topIndustries.some((i) => i.industry === "general"));
check("the summary names the count", digestSummary(digest).includes(`共新发布 ${digest.links.length} 个项目`), digestSummary(digest));
check("a past empty week says so plainly", digestSummary(weeklyDigest([], { year: 2026, week: 30 }, new Date("2026-09-25T12:00:00Z"))) === "这一周没有新发布的项目。");

// Industry lists.
const NOW = new Date("2026-09-25T12:00:00Z");
const industryPool = [
  tender("w1", { industries: ["water"], deadline: "2026-10-20T00:00:00Z" }),
  tender("w2", { industries: ["water", "construction"], country: "Peru", deadline: "2026-10-05T00:00:00Z" }),
  tender("w-expired", { industries: ["water"], deadline: "2026-09-01T00:00:00Z" }),
  tender("w-closed", { industries: ["water"], status: "submission_closed" }),
  tender("p1", { industries: ["power"] }),
];
const water = liveTenderLinksForIndustry(industryPool, "water", { now: NOW }).map((l) => l.id);
check("industry list: live rows of that tag only, nearest deadline first", water.join(",") === "w2,w1", water.join(","));
const counts = liveTenderCountsForIndustry(industryPool, "water", NOW);
check("industry counts per country match the list", counts.total === 2 && counts.byCountry.get("Mexico") === 1 && counts.byCountry.get("Peru") === 1);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exitCode = 1;
