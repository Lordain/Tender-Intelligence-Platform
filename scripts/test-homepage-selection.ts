/**
 * What the homepage shows, and in what order.
 *
 * Offline: selectHomepageTenders is pure, so this needs no Supabase and no
 * network. It is worth testing because the rule is a product decision rather
 * than a detail — the scrolling preview is the first thing a visitor sees, and
 * "closing soonest" only helps if a tender with no deadline, or one that
 * closed this morning, cannot appear in it.
 */
import { selectHomepageTenders } from "../lib/homepage-selection";
import { sortTenders } from "../lib/filter-tenders";
import type { HomepageControlSettings } from "../lib/db/site-settings";
import type { Tender, TenderRelevanceTier, TenderStatus } from "../types/tender";

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

function tender(
  slug: string,
  options: { deadline?: string; status?: TenderStatus; published?: string; country?: string; industries?: string[]; tier?: TenderRelevanceTier } = {},
): Tender {
  return {
    slug,
    country: options.country ?? "Mexico",
    publicationDate: options.published ?? "2026-09-01",
    submissionDeadline: options.deadline,
    status: options.status ?? "open",
    industries: options.industries ?? ["general"],
    relevance: { tier: options.tier ?? "standard" },
  } as Tender;
}

const settings = (overrides: Partial<HomepageControlSettings> = {}): HomepageControlSettings => ({
  featuredCount: 0,
  tickerCount: 3,
  featuredSlugs: [],
  tickerSlugs: null,
  tickerMode: "deadline",
  ...overrides,
});

{
  const sameDay = [
    tender("pe-1", { deadline: "2026-09-20T09:00:00Z", country: "Peru" }),
    tender("pe-2", { deadline: "2026-09-20T12:00:00Z", country: "Peru" }),
    tender("pe-3", { deadline: "2026-09-20T17:00:00Z", country: "Peru" }),
    tender("mx-1", { deadline: "2026-09-20T10:00:00Z", country: "Mexico" }),
    tender("mx-2", { deadline: "2026-09-20T15:00:00Z", country: "Mexico" }),
    tender("co-1", { deadline: "2026-09-20T11:00:00Z", country: "Colombia" }),
  ];
  const { ticker } = selectHomepageTenders(sameDay, settings({ tickerCount: 6 }));
  check(
    "same-day homepage projects round-robin countries",
    ticker.map((t) => t.slug).join(",") === "pe-1,mx-1,co-1,pe-2,mx-2,pe-3",
    ticker.map((t) => t.slug).join(","),
  );
}

const pool = [
  tender("far", { deadline: "2026-12-31" }),
  tender("soon", { deadline: "2026-09-20" }),
  tender("middle", { deadline: "2026-10-05" }),
  tender("no-deadline"),
  tender("closed", { deadline: "2026-09-01", status: "submission_closed" }),
  tender("awarded", { deadline: "2026-11-01", status: "awarded" }),
];

{
  const { ticker } = selectHomepageTenders(pool, settings());
  check("same size and industry: nearest deadline first", ticker.map((t) => t.slug).join(",") === "soon,middle,far", ticker.map((t) => t.slug).join(","));
  check("a tender with no deadline cannot be ranked by one, so it is out", !ticker.some((t) => t.slug === "no-deadline"));
  check("a closed tender has nothing left to bid on", !ticker.some((t) => t.slug === "closed"));
  check("nor has an awarded one, deadline or not", !ticker.some((t) => t.slug === "awarded"));
}

{
  const { ticker } = selectHomepageTenders(pool, settings({ tickerCount: 2 }));
  check("前台显示数量 caps the list", ticker.length === 2 && ticker[0].slug === "soon");
}

{
  // The two collections stay disjoint, in automatic mode too: a project shown
  // as a free card must not also scroll past in the ticker.
  const { featured, ticker } = selectHomepageTenders(pool, settings({ featuredCount: 1, featuredSlugs: ["soon"] }));
  check("a featured project is not repeated in the ticker", featured[0].slug === "soon" && !ticker.some((t) => t.slug === "soon"));
  check("…and the ticker just moves up to the next one", ticker[0].slug === "middle");
}

{
  // Switching back must restore exactly the hand-picked list, in its order.
  const manual = settings({ tickerMode: "manual", tickerSlugs: ["far", "soon"] });
  const { ticker } = selectHomepageTenders(pool, manual);
  check("manual mode keeps the admin's own order", ticker.map((t) => t.slug).join(",") === "far,soon");
  check("…and does not silently apply the deadline rule", ticker[0].slug === "far");
}

{
  // A database where nothing carries a deadline must not take the homepage to
  // zero cards silently — it returns an empty ticker, and the caller renders
  // whatever it renders for that, but nothing throws.
  const { ticker } = selectHomepageTenders([tender("a"), tender("b")], settings());
  check("no deadlines anywhere is an empty ticker, not a crash", ticker.length === 0);
}

{
  // The first-impression rule (user, 2026-10-02): two per industry, 大型 then
  // 中型 first, countries interleaved.
  const many = [
    // Seven power rows: only two may show, and the big ones win.
    ...Array.from({ length: 5 }, (_, i) => tender(`power-std-${i}`, { deadline: "2026-10-01", industries: ["power"], country: "Mexico" })),
    tender("power-big", { deadline: "2026-12-01", industries: ["power"], tier: "flagship", country: "Chile" }),
    tender("power-mid", { deadline: "2026-11-01", industries: ["power"], tier: "significant", country: "Brazil" }),
    tender("water-1", { deadline: "2026-10-10", industries: ["water"], country: "Peru" }),
    tender("water-2", { deadline: "2026-10-11", industries: ["water"], country: "Peru" }),
    tender("water-ar", { deadline: "2026-10-12", industries: ["water"], country: "Argentina" }),
    tender("ict-1", { deadline: "2026-10-05", industries: ["ict_telecom", "power"], country: "Colombia" }),
  ];
  const { ticker } = selectHomepageTenders(many, settings({ tickerCount: 6 }));
  const slugs = ticker.map((t) => t.slug);
  check("大型 and 中型 come before 常规", slugs[0] === "power-big" && slugs[1] === "power-mid", slugs.join(","));
  check("no industry takes more than two showcase places", slugs.slice(0, 5).filter((s) => s.startsWith("power")).length === 2, slugs.join(","));
  check("every industry with live projects is shown", ["water", "ict"].every((prefix) => slugs.some((s) => s.startsWith(prefix))), slugs.join(","));
  check("an industry's pair prefers two countries", slugs.includes("water-1") && slugs.includes("water-ar") && !slugs.includes("water-2"), slugs.join(","));
  check("a multi-tag tender counts once", new Set(slugs).size === slugs.length);
  check(
    "once every industry has its two, the rest follows by size and deadline",
    slugs.length === 6 && slugs[5] === "power-std-0",
    slugs.join(","),
  );
}

{
  // /tenders opens in the same order (sort "recommended", the default).
  const now = new Date("2026-09-30T00:00:00Z").getTime();
  const list = [
    tender("closed-big", { deadline: "2026-09-01", status: "submission_closed", tier: "flagship", industries: ["power"] }),
    tender("power-std", { deadline: "2026-10-01", industries: ["power"] }),
    tender("power-big", { deadline: "2026-12-01", industries: ["power"], tier: "flagship", country: "Chile" }),
    tender("water-mid", { deadline: "2026-11-01", industries: ["water"], tier: "significant", country: "Peru" }),
    tender("power-std-2", { deadline: "2026-10-02", industries: ["power"], country: "Peru" }),
    tender("power-std-3", { deadline: "2026-10-03", industries: ["power"] }),
  ];
  const slugs = sortTenders(list, "recommended", now).map((t) => t.slug);
  check("list: 大型, then 中型, then the rest", slugs.slice(0, 2).join(",") === "power-big,water-mid", slugs.join(","));
  check("list: a closed tender stays behind every live one, however big", slugs[slugs.length - 1] === "closed-big", slugs.join(","));
  check("list: nothing is dropped", slugs.length === list.length);
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exitCode = 1;
