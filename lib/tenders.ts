import "server-only";
import { TENDERS_CACHE_TAG } from "@/lib/cache-tags";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";
import { tenders as mockTenders } from "@/data/tenders";
import type { Tender } from "@/types/tender";
import { fetchAllTendersFromDb, fetchTenderByPublicSlugFromDb, fetchTenderBySlugFromDb, fetchTendersBySlugsFromDb } from "@/lib/db/tenders";

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

/** Public route lookup only; never falls back to matching the internal slug. */
export async function getTenderByPublicSlug(publicSlug: string): Promise<Tender | undefined> {
  const fromDb = await fetchTenderByPublicSlugFromDb(publicSlug);
  if (fromDb !== null) return fromDb;
  return mockTenders.find((tender) => tender.publicSlug === publicSlug);
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
 *
 * STORED COMPRESSED (2026-09-26). Next's data cache refuses any entry over
 * 2 MB — it logs one warning and simply does not store it
 * (node_modules/next/dist/server/lib/incremental-cache/index.js, "items over
 * 2MB can not be cached") — after which every request would run the full
 * query again (1.5–2 s measured) with nothing visibly wrong. Measured that
 * day: 458 public rows, 1,187,160 characters of JSON, ~2,600 per row, so the
 * plain list would have stopped caching at roughly 800 rows, a few weeks of
 * ingestion away. Brotli (quality 5) stores it at ~216,000 characters —
 * room for several thousand rows — for ~7 ms of extra decoding per request.
 * The Tender objects come back exactly as before (the cache already
 * round-tripped them through JSON), so no caller changes.
 *
 * The cache key changed with the stored shape ("-v2"), so an entry written by
 * the previous deployment is never decoded as a compressed one.
 */
const TENDER_LIST_CACHE_LIMIT = 2 * 1024 * 1024;
const TENDER_LIST_CACHE_WARN_AT = Math.floor(TENDER_LIST_CACHE_LIMIT * 0.75);

async function encodedTenderList(): Promise<string> {
  const encoded = brotliCompressSync(JSON.stringify(await getAllTenders()), {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
  }).toString("base64");
  if (encoded.length > TENDER_LIST_CACHE_WARN_AT) {
    // Said before it happens, not after: past the limit the site keeps
    // working, only slower on every page, which nobody would notice as such.
    const message = `公开项目列表缓存已达 ${(encoded.length / 1024 / 1024).toFixed(2)} MB（压缩后），Next 数据缓存上限 2 MB；超过后每次打开列表都会全量查询数据库`;
    console.warn(`[tender-list-cache] ${message}`);
    await reportOpsFailure(createSupabaseAdminClient(), { source: "tender-list-cache:size", title: "项目列表缓存接近上限", message });
  }
  return encoded;
}

const getCachedTenderListEncoded = unstable_cache(encodedTenderList, ["public-tender-list-v2"], {
  revalidate: 300,
  tags: [TENDERS_CACHE_TAG],
});

/** React's cache() so the several readers in one render decode the list once. */
export const getCachedTenderList = cache(async (): Promise<Tender[]> =>
  JSON.parse(brotliDecompressSync(Buffer.from(await getCachedTenderListEncoded(), "base64")).toString("utf8")) as Tender[],
);
