import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_HOMEPAGE_FEATURED_COUNT = 3;

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
