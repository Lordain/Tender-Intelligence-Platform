import "server-only";
import { unstable_cache } from "next/cache";
import { tenders as mockTenders } from "@/data/tenders";
import type { Tender } from "@/types/tender";
import { fetchAllTendersFromDb, fetchTenderBySlugFromDb, fetchTendersBySlugsFromDb } from "@/lib/db/tenders";

/** Supabase-backed when configured; bundled mock data is used only when Supabase is not configured. Query failures throw so a transient outage is never cached as mock production data. */
export async function getAllTenders(): Promise<Tender[]> {
  const fromDb = await fetchAllTendersFromDb();
  return fromDb ?? mockTenders;
}

/** undefined means "no tender with this slug", whether backed by Supabase or mock data. */
export async function getTenderBySlug(slug: string): Promise<Tender | undefined> {
  const fromDb = await fetchTenderBySlugFromDb(slug);
  if (fromDb !== null) return fromDb;
  return mockTenders.find((tender) => tender.slug === slug);
}

/** Slug-keyed full detail for many tenders in one query — see fetchTendersBySlugsFromDb. A slug with no matching tender is simply absent from the map. */
export async function getTendersBySlugs(slugs: string[]): Promise<Map<string, Tender>> {
  const fromDb = await fetchTendersBySlugsFromDb(slugs);
  if (fromDb) return fromDb;
  const wanted = new Set(slugs);
  return new Map(mockTenders.filter((tender) => wanted.has(tender.slug)).map((tender) => [tender.slug, tender]));
}

/**
 * The public tender list, cached across requests for five minutes.
 *
 * /tenders used to get this from `export const revalidate = 300` on the page
 * segment. That silently stopped working the moment the page started reading
 * the viewer's entitlement: getViewerRole() reads cookies(), which opts the
 * route into dynamic rendering, and a dynamic segment ignores revalidate —
 * confirmed as `ƒ /tenders` in a real `next build` route table. Every visit
 * was running this unbounded full-table query again. The PAGE has to be
 * per-viewer now; the DATA behind it does not, because it is identical for
 * every visitor — so the cache moves down here, where the request-scoped part
 * of the render can no longer disable it. Same five minutes as before, still
 * far below the few-times-a-day ingestion rate.
 *
 * unstable_cache rather than `use cache`: this project does not set the
 * cacheComponents flag, so it is on Next's previous caching model — see
 * node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md.
 */
export const getCachedTenderList = unstable_cache(getAllTenders, ["public-tender-list"], {
  revalidate: 300,
  tags: ["tenders"],
});
