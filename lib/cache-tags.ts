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
import { revalidatePath, revalidateTag } from "next/cache";

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
  revalidateAdminTenderList();
}

/** The admin list route. Exported for the rare caller that changes only admin-visible state. */
export const ADMIN_TENDER_LIST_PATH = "/admin/tenders";

/**
 * Drops the admin tender list from the CLIENT cache as well as the server's.
 *
 * The tag above does nothing for /admin/tenders: that page reads Supabase
 * directly (fetchAdminTenderListFromDb — no unstable_cache, no tag), so its
 * data was never server-cached and there was nothing to invalidate. What went
 * stale is the browser's own Router Cache. Per next/dist/docs (glossary,
 * Client Cache): "Pages are not cached by default but are reused during
 * browser back/forward navigation" — so clicking 返回项目管理 refetched, and
 * pressing the browser Back button did not. An admin filling in deadlines one
 * tender at a time goes back after every single one, and saw the row they had
 * just fixed still sitting in the 缺交标日期 list (reported 2026-09-14).
 *
 * The same docs list revalidatePath as one of the calls that invalidates that
 * cache, which is what this is. Folded into revalidateTenders() rather than
 * added to 29 route handlers one by one: every one of them already calls it,
 * and every one of them changes something this list displays — a title, a
 * tier, a date, or the row's existence.
 */
export function revalidateAdminTenderList(): void {
  revalidatePath(ADMIN_TENDER_LIST_PATH);
}
