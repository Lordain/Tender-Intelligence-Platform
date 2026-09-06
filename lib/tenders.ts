import "server-only";
import { tenders as mockTenders } from "@/data/tenders";
import type { Tender } from "@/types/tender";
import { fetchAllTendersFromDb, fetchTenderBySlugFromDb, fetchTendersBySlugsFromDb } from "@/lib/db/tenders";

/** Supabase-backed when configured (NEXT_PUBLIC_SUPABASE_URL + a key are set); falls back to bundled mock data otherwise. */
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
