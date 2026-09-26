import { NextResponse, type NextRequest } from "next/server";
import { getCachedTenderList } from "@/lib/tenders";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { tenderListViewerRules } from "@/lib/tender-list-page";
import { isSavedSearchInput, matchSavedSearchAlerts } from "@/lib/saved-search-alerts";
import { clientIp, createRateLimiter } from "@/lib/security/rate-limit";

/**
 * Per address, per instance — see lib/security/rate-limit.ts for what that
 * does and does not stop. This route sits outside the /tenders page limiter
 * (bot-protection.ts matches page paths only), and each call can carry
 * twenty searches, so without its own limit it answered "does this phrase
 * match anything?" as fast as a script could ask. The bell calls it once per
 * page view, only for searches with reminders on; thirty a minute is far
 * above that.
 */
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });

/**
 * Match saved searches server-side so the header never receives the complete
 * tender database.
 *
 * Deliberately still answers a GUEST rather than rejecting one: saved searches
 * live in localStorage and the bell renders for logged-out visitors, so a 401
 * here would break a working feature to protect data that simply should not
 * have been in the response. The role decides the projection instead — the
 * same shape /tenders serves the same viewer.
 *
 * Filters and viewer rules are the list page's own (2026-09-26 review), via
 * lib/saved-search-alerts.ts: this route used to ignore the saved link's
 * country, and let a Basic subscriber's keywords search the Spanish title,
 * buyer and procurement number of every country.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (ip !== "unknown" && isRateLimited(ip)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试。" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const body = await request.json().catch(() => null) as { searches?: unknown[] } | null;
  const searches = Array.isArray(body?.searches) ? body.searches.filter(isSavedSearchInput) : [];
  if (searches.length === 0) return NextResponse.json([]);

  const [entitlement, tenders] = await Promise.all([getViewerEntitlement(), getCachedTenderList()]);
  return NextResponse.json(matchSavedSearchAlerts(tenders, searches, tenderListViewerRules(entitlement)));
}
