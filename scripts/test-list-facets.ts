/**
 * The /tenders filter facets, computed from the rows a visitor can reach.
 *
 * The user's report (2026-09-20): 巴西前台如果现在看到的项目数 = 0，就先隐藏
 * 这个国家，如果 > 0 就展示. A connector can import every day while every row
 * it writes lands in the excluded tier. The country pill was drawn from
 * AVAILABLE_COUNTRIES, a hardcoded list, so it stayed up regardless — a
 * filter that can only return zero, which reads as a broken site rather than
 * as an empty country.
 *
 * The trap is the BASIS. `allTenders` carries excluded-tier rows;
 * `filtered` carries only what the viewer's current filters left. A facet
 * built on the first offers options that return nothing; a facet built on
 * the second deletes its own option the moment you tick it. Everything here
 * is built on the set in between, and these checks pin that.
 *
 * Offline: buildTenderListPage is pure, so no Supabase and no network.
 */
import { AVAILABLE_COUNTRIES, buildTenderListPage } from "../lib/tender-list-page";
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
  country: string,
  tier: TenderRelevanceTier,
  options: { status?: TenderStatus; industries?: string[]; scopeType?: string } = {},
): Tender {
  return {
    id: slug,
    slug,
    publicSlug: slug,
    tenderNumber: slug,
    title: { zh: slug, es: slug },
    summary: { zh: "", es: "" },
    industries: options.industries ?? ["construction"],
    scopeType: options.scopeType ?? "works",
    status: options.status ?? "open",
    country,
    publicationDate: "2026-09-14",
    submissionDeadline: "2026-12-01",
    relevance: { tier, label: "", reason: "" },
    createdAt: "2026-09-14T00:00:00.000Z",
  } as unknown as Tender;
}

const NOW = new Date("2026-09-20T12:00:00.000Z");
const page = (rows: Tender[], params = {}) => buildTenderListPage(rows, params, { now: NOW });

// ── The country pill ────────────────────────────────────────────────────────

// Brazil's real shape on the day this was written: rows in the table, every
// one of them screened out of every public surface.
const brazilAllExcluded = [
  tender("mx-1", "Mexico", "standard"),
  tender("br-1", "Brazil", "excluded"),
  tender("br-2", "Brazil", "excluded"),
];

check(
  "a country whose every row is excluded is dropped from the pills",
  !page(brazilAllExcluded).availableCountries.includes("Brazil"),
  page(brazilAllExcluded).availableCountries.join(","),
);

check(
  "the country that does have a visible row stays",
  page(brazilAllExcluded).availableCountries.includes("Mexico"),
);

// One surviving row is the whole condition — no threshold, nothing to undo.
const brazilOneKept = [...brazilAllExcluded, tender("br-3", "Brazil", "standard")];

check(
  "one visible Brazilian tender brings the pill back by itself",
  page(brazilOneKept).availableCountries.includes("Brazil"),
);

check(
  "the pills keep AVAILABLE_COUNTRIES' order, not the data's",
  page([
    tender("pe-1", "Peru", "standard"),
    tender("br-4", "Brazil", "standard"),
    tender("mx-2", "Mexico", "standard"),
  ]).availableCountries.join(",") === "Mexico,Brazil,Peru",
);

// The allowlist is still the outer gate: a country with no connector cannot
// appear just because a row names it. Chile is in ALL_COUNTRIES (the admin
// form's <select>) but not in AVAILABLE_COUNTRIES.
check(
  "a country outside AVAILABLE_COUNTRIES never appears, visible rows or not",
  !page([tender("cl-1", "Chile", "flagship")]).availableCountries.includes(
    "Chile" as (typeof AVAILABLE_COUNTRIES)[number],
  ),
);

// Ticking a country must not delete its own pill — which is what computing
// the facet from the filtered result set would do.
check(
  "选中一个国家 does not remove the others from the pill row",
  page(brazilOneKept, { country: "Mexico" }).availableCountries.includes("Brazil"),
);

// ── The other two facets, same basis ────────────────────────────────────────

const onlyExcludedCarriesWater = [
  tender("mx-3", "Mexico", "standard", { industries: ["construction"], scopeType: "works" }),
  tender("mx-4", "Mexico", "excluded", { industries: ["water"], scopeType: "services" }),
];

check(
  "an industry only excluded rows carry is not offered",
  !page(onlyExcludedCarriesWater).availableIndustries.includes("water"),
  page(onlyExcludedCarriesWater).availableIndustries.join(","),
);

check(
  "a scope type only excluded rows carry is not offered",
  !page(onlyExcludedCarriesWater).availableScopeTypes.includes("services"),
  page(onlyExcludedCarriesWater).availableScopeTypes.join(","),
);

check(
  "the industry a visible row carries is still offered",
  page(onlyExcludedCarriesWater).availableIndustries.includes("construction"),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
