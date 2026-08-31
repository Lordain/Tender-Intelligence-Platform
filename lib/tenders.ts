import "server-only";
import { tenders as mockTenders } from "@/data/tenders";
import type { Tender } from "@/types/tender";
import { fetchAllTendersFromDb, fetchTenderBySlugFromDb } from "@/lib/db/tenders";

/** Supabase-backed when configured (SUPABASE_URL + a key are set); falls back to bundled mock data otherwise. */
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
