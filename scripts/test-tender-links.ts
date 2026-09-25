/**
 * The short tender lists on country pages, guides, insights and each
 * tender's own detail page (lib/tender-links.ts).
 *
 * Offline and pure. What is pinned: at most three related items (user,
 * 2026-09-25: 建议不超过3个项目), same country only, never the tender itself,
 * never an expired, closed or excluded row, never an untranslated title —
 * and only the guest projection, because every one of these lists is on a
 * page crawlers read.
 */
import { featuredTenderLinksForCountry, liveTenderLinksForCountry, relatedTenderLinks, tenderLinksForGuide } from "../lib/tender-links";
import type { Tender, TenderRelevanceTier, TenderStatus } from "../types/tender";

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { passed += 1; console.log(`OK   ${label}`); }
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const NOW = new Date("2026-09-25T12:00:00Z");

function tender(id: string, o: {
  country?: string; industries?: string[]; tier?: TenderRelevanceTier; status?: TenderStatus;
  deadline?: string; zh?: string; sourceName?: string; buyer?: string;
} = {}): Tender {
  return {
    id,
    slug: id,
    publicSlug: `p-${id}`,
    country: o.country ?? "Mexico",
    industries: o.industries ?? ["power"],
    status: o.status ?? "open",
    scopeType: "works",
    currency: "MXN",
    estimatedValue: 12_345_678,
    submissionDeadline: o.deadline ?? "2026-10-18T17:00:00Z",
    title: { zh: o.zh ?? `中文标题 ${id}`, es: `Título original ${id}`, en: "" },
    publicTitle: o.zh ?? `中文标题 ${id}`,
    buyer: o.buyer ?? "Comisión Federal de Electricidad",
    sourceName: o.sourceName ?? "Compras MX",
    relevance: { tier: o.tier ?? "standard", label: "", reason: "" },
    createdAt: "2026-09-20T00:00:00Z",
  } as unknown as Tender;
}

const self = tender("self", { industries: ["power", "construction"] });
const pool = [
  self,
  tender("same-power", { industries: ["power"] }),
  tender("same-both", { industries: ["power", "construction"] }),
  tender("same-water", { industries: ["water"] }),
  tender("same-flagship-water", { industries: ["water"], tier: "flagship" }),
  tender("other-country", { country: "Peru", industries: ["power", "construction"] }),
  tender("expired", { industries: ["power", "construction"], deadline: "2026-09-01T00:00:00Z" }),
  tender("closed", { industries: ["power", "construction"], status: "submission_closed" }),
  tender("excluded", { industries: ["power", "construction"], tier: "excluded" }),
  tender("untranslated", { industries: ["power", "construction"], zh: "Título original untranslated" }),
];

{
  const related = relatedTenderLinks(pool, self, { now: NOW });
  const ids = related.map((link) => link.id);
  check("related: at most three", related.length === 3, ids.join(","));
  check("related: never the tender itself", !ids.includes("self"));
  check("related: same country only", related.every((link) => link.country === "Mexico"), ids.join(","));
  check("related: most shared industries first", ids[0] === "same-both" && ids[1] === "same-power", ids.join(","));
  check("related: no expired, closed, excluded or untranslated rows",
    !ids.some((id) => ["expired", "closed", "excluded", "untranslated"].includes(id)), ids.join(","));
  const first = related[0];
  check("related: deadline is month precision", first.submissionDeadline === "2026-10", String(first.submissionDeadline));
  check("related: carries no buyer, budget or original title",
    !("buyer" in first) && !("estimatedValue" in first) && !JSON.stringify(first).includes("Título"), JSON.stringify(first));
}

{
  const all = liveTenderLinksForCountry(pool, "Mexico", { now: NOW });
  check("country list: every live Mexican row, nearest deadline first", all.length === 5 && all.every((link) => link.country === "Mexico"), all.map((l) => l.id).join(","));
}

{
  const featured = featuredTenderLinksForCountry(pool, "Mexico", { now: NOW });
  check("insight picks: three, biggest tier first", featured.length === 3 && featured[0].id === "same-flagship-water", featured.map((l) => l.id).join(","));
}

{
  const petronect = [
    tender("pn-1", { country: "Brazil", sourceName: "Petronect", buyer: "Petrobras" }),
    tender("pncp-1", { country: "Brazil", sourceName: "PNCP", buyer: "Prefeitura" }),
  ];
  const matched = tenderLinksForGuide(petronect, { slug: "brazil-petrobras-petronect", countryKey: "Brazil" }, { now: NOW });
  check("guide: the platform's own tenders when it has any", matched.scope === "platform" && matched.links.map((l) => l.id).join() === "pn-1", JSON.stringify(matched));
  const fallback = tenderLinksForGuide(petronect, { slug: "brazil-cemig", countryKey: "Brazil" }, { now: NOW });
  check("guide: falls back to the country, and says so", fallback.scope === "country" && fallback.links.length === 2, JSON.stringify(fallback));
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exitCode = 1;
