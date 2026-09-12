import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_HOMEPAGE_FEATURED_COUNT = 3;
const DEFAULT_HOMEPAGE_TICKER_COUNT = 10;

export type HomepageControlSettings = {
  featuredCount: number;
  tickerCount: number;
  featuredSlugs: string[] | null;
  tickerSlugs: string[] | null;
};

function parseCount(value: unknown, fallback: number): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : fallback;
}

function parseSlugList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

/**
 * How many tenders the homepage shows for free (app/page.tsx). Falls back
 * to the hardcoded default when Supabase isn't configured, the setting row
 * is missing, or its value isn't a positive number — a bad or absent
 * setting should never take the homepage down to 0 cards.
 */
export async function fetchHomepageFeaturedCount(): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return DEFAULT_HOMEPAGE_FEATURED_COUNT;

  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_featured_count")
    .maybeSingle();

  if (error || !data) return DEFAULT_HOMEPAGE_FEATURED_COUNT;
  const n = Number(data.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_HOMEPAGE_FEATURED_COUNT;
}

/**
 * Homepage curation lives in site_settings so it can be changed without a
 * schema migration. A null list means the new control page has never saved
 * that list; callers can then preserve the legacy homepage fallback.
 */
export async function fetchHomepageControlSettings(): Promise<HomepageControlSettings> {
  const fallback: HomepageControlSettings = {
    featuredCount: DEFAULT_HOMEPAGE_FEATURED_COUNT,
    tickerCount: DEFAULT_HOMEPAGE_TICKER_COUNT,
    featuredSlugs: null,
    tickerSlugs: null,
  };
  const supabase = getSupabaseServerClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", [
      "homepage_featured_count",
      "homepage_ticker_count",
      "homepage_featured_slugs",
      "homepage_ticker_slugs",
    ]);

  if (error || !data) return fallback;
  const settings = new Map(data.map((row) => [row.key, row.value]));

  return {
    featuredCount: parseCount(settings.get("homepage_featured_count"), DEFAULT_HOMEPAGE_FEATURED_COUNT),
    tickerCount: parseCount(settings.get("homepage_ticker_count"), DEFAULT_HOMEPAGE_TICKER_COUNT),
    featuredSlugs: parseSlugList(settings.get("homepage_featured_slugs")),
    tickerSlugs: parseSlugList(settings.get("homepage_ticker_slugs")),
  };
}
