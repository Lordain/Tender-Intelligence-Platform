/**
 * Runs classifyRelevance() against every permanent fixture in
 * lib/relevance-fixtures.ts and reports pass/fail — the regression suite
 * for the "growing whitelist" (see that file's header). Pure function,
 * no Supabase/network access, so this runs anywhere including this
 * sandbox.
 *
 * Usage:
 *   npm run test:relevance
 *
 * When a fixture fails after a keyword/threshold change, that's either a
 * real regression (fix the rule) or an intentional tier change (update the
 * fixture's expectedTier and note why). When the user gives a new real
 * example, add it to RELEVANCE_FIXTURES first, then run this — a failure
 * tells you exactly what rule needs to change.
 */
import { classifyRelevance } from "../lib/relevance";
import { RELEVANCE_FIXTURES } from "../lib/relevance-fixtures";

let passed = 0;
let failed = 0;

for (const fixture of RELEVANCE_FIXTURES) {
  const result = classifyRelevance({
    title: fixture.title,
    summary: fixture.summary,
    industries: fixture.industries ?? [],
    scopeType: fixture.scopeType ?? "equipment",
    estimatedValue: fixture.estimatedValue,
    currency: fixture.currency,
    buyer: fixture.buyer,
    country: fixture.country,
    isNationalPriorityProject: fixture.isNationalPriorityProject,
  });

  const ok = result.tier === fixture.expectedTier;
  if (ok) passed++;
  else failed++;

  const status = ok ? "OK  " : "FAIL";
  console.log(`${status} ${result.tier.padEnd(11)} expected ${fixture.expectedTier.padEnd(11)} | ${fixture.title.slice(0, 65)}`);
  if (!ok) console.log(`       note: ${fixture.note}`);
}

console.log(`\n${passed}/${RELEVANCE_FIXTURES.length} fixtures passed.`);
if (failed > 0) {
  console.log(`${failed} FAILURE(S) — see above.`);
  process.exit(1);
}
