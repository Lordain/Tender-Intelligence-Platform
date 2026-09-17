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
import type { HomepageControlSettings } from "../lib/db/site-settings";
import type { Tender, TenderStatus } from "../types/tender";

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

function tender(slug: string, options: { deadline?: string; status?: TenderStatus; published?: string; country?: string } = {}): Tender {
  return {
    slug,
    country: options.country ?? "Mexico",
    publicationDate: options.published ?? "2026-09-01",
    submissionDeadline: options.deadline,
    status: options.status ?? "open",
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
  check("nearest deadline first", ticker.map((t) => t.slug).join(",") === "soon,middle,far", ticker.map((t) => t.slug).join(","));
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

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exitCode = 1;
