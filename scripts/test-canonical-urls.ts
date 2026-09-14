/**
 * Every indexable page must name its OWN canonical URL.
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
 * Static analysis only: no build, no network, no Supabase.
 */
import { readFileSync } from "node:fs";

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

/** "/" -> app/page.tsx, "/refund-policy" -> app/refund-policy/page.tsx */
function pageFileFor(route: string): string {
  return route === "/" ? "app/page.tsx" : `app${route}/page.tsx`;
}

const routes = staticRoutesFromSitemap(sitemap);
check("the sitemap's static routes were readable", routes.length >= 9, `found ${routes.length}`);

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
    source.includes(`canonical: "${route}"`),
    `expected \`canonical: "${route}"\` in ${file}`,
  );
}

// The two dynamic routes build theirs from the slug, so they are checked by
// shape rather than by literal. Both are real indexable pages: a guide always,
// a tender detail only when it is a free preview (the rest set robots.index
// false, which is deliberate — see that file).
for (const [file, label] of [
  ["app/guides/[slug]/page.tsx", "guide detail"],
  ["app/tenders/[slug]/page.tsx", "tender detail"],
] as const) {
  const source = readFileSync(file, "utf-8");
  check(`${label} builds a canonical from its slug`, /alternates:\s*\{\s*canonical:\s*`/.test(source), file);
}

// The guides are the reason this matters most, so they are named explicitly.
check(
  "the guide canonical is the guide's own path",
  readFileSync("app/guides/[slug]/page.tsx", "utf-8").includes("canonical: `/guides/${guide.slug}`"),
);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed > 0) process.exit(1);
