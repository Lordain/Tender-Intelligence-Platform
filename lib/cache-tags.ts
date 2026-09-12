/**
 * The public tender list is cached for 5 minutes (`unstable_cache` in
 * lib/tenders.ts). The tag was declared there from the start, but nothing
 * ever invalidated it — so every admin edit took up to 5 minutes to appear
 * on the public site, with no way to tell whether a change had failed or
 * was simply still waiting. Fixed 2026-09-11.
 *
 * Called from the API routes rather than from lib/ingestion/*, because those
 * modules are shared with the terminal scripts, where there is no Next.js
 * request context and `revalidateTag` has nothing to invalidate. A CLI
 * import therefore still waits out the 5-minute TTL — acceptable, since
 * nobody is watching the site for the result of a bulk import the way they
 * watch it after fixing one tender's title.
 */
import { revalidateTag } from "next/cache";

export const TENDERS_CACHE_TAG = "tenders";

/**
 * Drops the cached public tender list so the next request rebuilds it.
 *
 * `{ expire: 0 }`, not the `"max"` profile the Next 16 docs recommend for
 * most cases. "max" is stale-while-revalidate: the admin who just fixed a
 * title would still be served the old one while the refresh ran in the
 * background, which is the exact complaint this is fixing. Correctness beats
 * latency here — these writes are rare, admin-triggered, and the person
 * making them is looking at the result.
 *
 * `updateTag()` would give read-your-own-writes, but it is Server
 * Actions-only and every caller here is a Route Handler.
 */
export function revalidateTenders(): void {
  revalidateTag(TENDERS_CACHE_TAG, { expire: 0 });
}
