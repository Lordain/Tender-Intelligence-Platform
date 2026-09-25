/**
 * Every indexable page must name its OWN canonical URL and its OWN share card.
 *
 * The bug this exists to prevent, found 2026-09-14 while asking why the site
 * could not be found on Google at all: the root layout set
 * `alternates: { canonical: "/" }`, and Next inherits a metadata field whole
 * into any route that does not set its own. So /pricing, /guides, all seven
 * 参标指南 pages and every policy page emitted
 * `<link rel="canonical" href="https://latintender.com/">` — each one telling
 * a crawler "I am a duplicate of the homepage, index that instead." The guides
 * are the only real long-tail content on the site and they were signing
 * themselves out of the index.
 *
 * A wrong canonical is invisible: the page renders correctly, the title and
 * description are right, nothing errors, and the only symptom is a search
 * result that never appears. So it gets a test.
 *
 * The route list is READ FROM app/sitemap.ts rather than repeated here — a
 * page added to the sitemap without a canonical is exactly the regression,
 * and a hand-copied list in this file would not catch it.
 *
 * The same inheritance rule cost a second thing: no page set `openGraph`, so
 * every one of them served the homepage's og:title and og:description. Each
 * guide, the pricing page and every policy page produced an identical card
 * when pasted into WeChat — which, for a product that spreads by being
 * forwarded to a colleague, the root layout's own comment calls more
 * expensive than any ranking factor. lib/seo.ts's pageMetadata() now emits
 * title, canonical and card together so they cannot drift; this checks that
 * every page actually goes through it.
 *
 * Static analysis only: no build, no network, no Supabase.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

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

const sitemap = readFileSync("app/sitemap.ts", "utf-8");
const layout = readFileSync("app/layout.tsx", "utf-8");

// The whole point of the fix: nothing may inherit a canonical from the layout.
check(
  "the root layout sets no canonical for every page to inherit",
  !/alternates\s*:/.test(layout),
  "app/layout.tsx declares `alternates` again — see its comment",
);

/** `{ url: origin, ... }` and `` { url: `${origin}/guides`, ... } `` from the sitemap's static list. */
function staticRoutesFromSitemap(source: string): string[] {
  const routes = new Set<string>();
  if (/url:\s*origin\b/.test(source)) routes.add("/");
  for (const match of source.matchAll(/url:\s*`\$\{origin\}(\/[^`$]*)`/g)) routes.add(match[1]);
  return [...routes];
}

/**
 * The sitemap used to list `/insights/mexico|colombia|peru` one literal per
 * line, so the regex above found them. On 2026-09-21 they became
 * `countryInsights.map(...)` — correct for the sitemap (Brazil was added and
 * a fourth literal would have been forgotten sooner or later), and it silently
 * took six checks out of this file: no country insight page was canonical-
 * checked any more, the new one included. A refactor that turns a check into a
 * no-op is the regression this file was written about, so the slugs are read
 * from the same array the sitemap maps over — still no hand-copied list.
 *
 * Each of these is its own `app/insights/<slug>/page.tsx`, not a `[slug]`
 * route, which is why they belong with the static routes and not with the two
 * dynamic ones below.
 */
function insightRoutesFromSitemap(sitemapSource: string): string[] {
  if (!/countryInsights\.map\(/.test(sitemapSource)) return [];
  const insights = readFileSync("lib/country-insights.ts", "utf-8");
  return [...insights.matchAll(/^\s*slug:\s*"([a-z0-9-]+)"/gm)].map((m) => `/insights/${m[1]}`);
}

/** "/" -> app/page.tsx, "/refund-policy" -> app/refund-policy/page.tsx */
function pageFileFor(route: string): string {
  return route === "/" ? "app/page.tsx" : `app${route}/page.tsx`;
}

const insightRoutes = insightRoutesFromSitemap(sitemap);
const routes = [...new Set([...staticRoutesFromSitemap(sitemap), ...insightRoutes])];
check("the sitemap's static routes were readable", routes.length >= 9, `found ${routes.length}`);
check(
  "the country insight pages are still in the route list",
  insightRoutes.length >= 4,
  `found ${insightRoutes.length} —— sitemap 不再 map countryInsights，或 lib/country-insights.ts 的 slug 写法变了`,
);

for (const route of routes) {
  const file = pageFileFor(route);
  let source = "";
  try {
    source = readFileSync(file, "utf-8");
  } catch {
    check(`${route} has a page file at ${file}`, false, "sitemap lists a route with no page here");
    continue;
  }
  check(
    `${route} declares its own canonical`,
    source.includes(`path: "${route}"`) || source.includes(`canonical: "${route}"`),
    `expected pageMetadata({ …, path: "${route}" }) in ${file}`,
  );
  // The homepage is the exception, and not a grudging one: the root layout's
  // title, description and openGraph ARE the homepage's — that is what a
  // site-level share card is. Routing it through pageMetadata() would restate
  // the brand copy in a second place for it to drift from, and the title
  // template would append the brand to a title that already ends in it.
  if (route !== "/") {
    check(
      `${route} builds its metadata through pageMetadata()`,
      source.includes("pageMetadata("),
      `${file} sets metadata by hand — its share card will be the homepage's`,
    );
  }
}

// The two dynamic routes build theirs from the slug, so they are checked by
// shape rather than by literal. Both are real indexable pages: guides expose
// their full article, while every tender exposes an approved public summary
// and keeps its protected analysis out of the visitor payload.
for (const [file, label] of [
  ["app/guides/[slug]/page.tsx", "guide detail"],
  ["app/tenders/[slug]/page.tsx", "tender detail"],
  ["app/countries/[country]/page.tsx", "country tenders"],
  ["app/industries/[industry]/page.tsx", "industry tenders"],
  ["app/weekly/[week]/page.tsx", "weekly digest"],
] as const) {
  const source = readFileSync(file, "utf-8");
  check(
    `${label} builds its metadata from its slug`,
    /pageMetadata\(\{[\s\S]{0,500}?path:\s*(?:`|publicTenderPath\()/.test(source),
    file,
  );
}

// The guides are the reason this matters most, so they are named explicitly.
check(
  "the guide canonical is the guide's own path",
  readFileSync("app/guides/[slug]/page.tsx", "utf-8").includes("path: `/guides/${guide.slug}`"),
);

// The five country pages exist only to rank on their own; a canonical that
// pointed anywhere else (the filtered /tenders list, say) would undo them.
check(
  "the country page canonical is its own path",
  readFileSync("app/countries/[country]/page.tsx", "utf-8").includes("path: `/countries/${page.slug}`"),
);
{
  const sitemap = readFileSync("app/sitemap.ts", "utf-8");
  check("the sitemap lists the country pages", sitemap.includes("countryPages.map"), "app/sitemap.ts");
  check("the sitemap lists the industry pages", sitemap.includes("industryPages.map"), "app/sitemap.ts");
  check("the sitemap lists the weekly digests", sitemap.includes("archiveWeeks("), "app/sitemap.ts");
}
check(
  "the industry page canonical is its own path",
  readFileSync("app/industries/[industry]/page.tsx", "utf-8").includes("path: `/industries/${page.slug}`"),
);
check(
  "the weekly digest canonical is its own week",
  readFileSync("app/weekly/[week]/page.tsx", "utf-8").includes("path: `/weekly/${weekSlug(week)}`"),
);

// pageMetadata() must keep restating the fields a page-level openGraph wipes
// out. Next replaces the layout's whole object rather than merging it, so a
// helper that emitted only title/description would silently drop siteName and
// locale from every page that used it.
{
  const seo = readFileSync("lib/seo.ts", "utf-8");
  for (const field of ["siteName", "locale", "type", "url"]) {
    check(`pageMetadata restates openGraph.${field}`, seo.includes(`${field}:`), "lib/seo.ts");
  }
}

/**
 * The gap the sitemap list cannot see: a page that is CRAWLABLE but not in the
 * sitemap.
 *
 * Google Search Console, 2026-09-21: one page reported as 「重複網頁；使用者未
 * 選取標準網頁」 — a duplicate that names no canonical of its own. Every route
 * in the sitemap was fine, because those are the ones this file already
 * checked. /login and /register are not in the sitemap and are allowed by
 * robots.ts on purpose ("a person searching for the product by name should be
 * able to land on them"), and they declared no metadata at all: no title of
 * their own, no description, no canonical. Two pages inheriting the root
 * layout's title and description verbatim are, to a crawler, two copies of the
 * same page.
 *
 * So the check is now the complement of robots.ts rather than a reading of the
 * sitemap: every page under app/ that a crawler is ALLOWED to reach must name
 * its own canonical, whether or not it is offered in the sitemap. Being absent
 * from the sitemap is not a way to opt out of being indexed — it only means
 * Google was not handed the URL, which says nothing about whether it found it.
 */
{
  // Read from robots.ts rather than repeated here: a path removed from the
  // disallow list silently becomes crawlable, and this check has to follow it.
  const robots = readFileSync("app/robots.ts", "utf-8");
  const privateBlock = /const PRIVATE_PATHS = \[([^\]]*)\]/.exec(robots);
  const privatePaths = privateBlock === null ? [] : [...privateBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  check("robots.ts still declares PRIVATE_PATHS for this check to read", privatePaths.length > 0, "app/robots.ts");

  function pagesUnder(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) found.push(...pagesUnder(`${dir}/${entry.name}`));
      else if (entry.name === "page.tsx") found.push(`${dir}/${entry.name}`);
    }
    return found;
  }

  for (const file of pagesUnder("app").sort()) {
    const dir = file.slice(0, -"/page.tsx".length);
    const route = `/${dir.slice("app/".length)}`.replace(/\/$/, "") || "/";
    // Dynamic segments are covered by the shape checks above.
    if (route.includes("[")) continue;
    if (privatePaths.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) continue;
    // A Client Component cannot export `metadata` at all, so the declaration
    // legitimately lives in a sibling layout.tsx — which is exactly how /login
    // and /register got theirs. Reading only page.tsx would report a page that
    // IS fixed as broken.
    const layout = `${dir}/layout.tsx`;
    const source = readFileSync(file, "utf-8") + (existsSync(layout) ? readFileSync(layout, "utf-8") : "");
    const namesCanonical = source.includes("pageMetadata(") || /alternates\s*:\s*\{[^}]*canonical/.test(source);
    const optsOut = /robots\s*:\s*\{[\s\S]{0,120}index:\s*false/.test(source);
    check(
      `${route} is crawlable, so it names its own canonical (or opts out with robots.index=false)`,
      namesCanonical || optsOut,
      `${file} — 允许被抓，却没有自己的 canonical：对爬虫来说它是首页的复制品`,
    );
  }
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
